import { Factory, FactoryDependencyRequest, FactoryInput } from '@/interfaces/planner/FactoryInterface'
import { findFac } from '@/utils/factory-management/factory'
import { calculateParts } from '@/utils/factory-management/parts'
import { DataInterface } from '@/interfaces/DataInterface'

// Adds dependencies between two factories.
export const updateDependency = (
  factory: Factory, // The factory that has the input
  provider: Factory, // The factory that provides the dependency
  input: FactoryInput
) => {
  if (!input.outputPart) {
    const errorMsg = `Factory ${factory.name} is attempting to add a dependency to factory ${provider.name} with no output part. The invalid input has been deleted.`
    console.error(errorMsg)
    // Delete the invalid input
    factory.inputs = factory.inputs.filter(i => i !== input)
    alert(errorMsg)
    return
  }

  // If array doesn't exist make it now.
  if (!provider.dependencies.requests[factory.id]) {
    provider.dependencies.requests[factory.id] = []
  }

  const requests = provider.dependencies.requests[factory.id]

  // Handle existing requests if they've been updated.
  const existingRequest = requests.find(req => req.part === input.outputPart)
  if (existingRequest) {
    // Wrap it like this so we don't induce reactivity for no change.
    if (existingRequest.amount !== input.amount) {
      // Ensure that the request amounts are exactly the same.
      existingRequest.amount = input.amount
    }

    return // Nothing more to do
  }

  requests.push({
    requestingFactoryId: factory.id,
    part: input.outputPart,
    amount: input.amount,
  })
}

// Scans for invalid dependency requests and removes the request and the input from the erroneous factory.
export const flushInvalidRequests = (factories: Factory[]): void => {
  // console.log('dependencies: flushInvalidRequests')
  factories.forEach(factory => {
    // If there's no requests, nothing to do.
    if (!factory.dependencies?.requests || Object.keys(factory.dependencies.requests).length === 0) {
      return
    }

    // Scan all requests for the factory
    Object.keys(factory.dependencies.requests).forEach(requestedFactoryId => {
      const requests: FactoryDependencyRequest[] = factory.dependencies.requests[requestedFactoryId]

      const dependantFactory = findFac(requestedFactoryId, factories)
      // If the factory doesn't exist, somehow this data corrupted, clean it up now.
      if (!dependantFactory?.id || !dependantFactory?.inputs) {
        console.error(`flushInvalidRequests: Requested factory ${requestedFactoryId} not found!`)
        delete factory.dependencies.requests[requestedFactoryId]
        alert(`The factory ${factory.name} has corrupted data and has been cleaned up. Please refresh the page.`)
        return // Nothing to do as the factory doesn't exist.
      }

      requests.forEach(request => {
        // Check if the requested part exists within the factory
        const foundPart = factory.parts[request.part]

        // If the product does not exist, remove the dependency and the input.
        if (!foundPart) {
          console.warn(`flushInvalidRequests: Factory "${factory.name}" (${factory.id}) does not have the product ${request.part} requested by "${dependantFactory.name}" (${dependantFactory.id})!`)

          // Filter out the dependency request(s) for the part from the erroneous factory.
          removeDependency(factory, dependantFactory, request.part)

          // Delete the input from the factory that caused the issue.
          dependantFactory.inputs.forEach((input, index) => {
            if (input.factoryId === factory.id && input.outputPart === request.part) {
              dependantFactory.inputs.splice(index, 1)
            }
          })
        }
        const foundProduct = factory.products.find(product => product.id === request.part)
        const foundByProduct = factory.byProducts.find(byProduct => byProduct.id === request.part)
        const foundPowerProducerByProduct = factory.powerProducers.find(powerProducer => powerProducer.byproduct?.part === request.part)

        // If a part is found, check if the part is produced within the factory. If it isn't, remove the dependency and the input.
        // Thankfully since we are doing the dependency calculation BEFORE the parts calculation, the part data will be eventually correct.
        if (foundPart && (!foundProduct && !foundByProduct && !foundPowerProducerByProduct)) {
          console.warn(`flushInvalidRequests: Factory "${factory.name}" (${factory.id}) does not produce the product ${request.part} requested by "${dependantFactory.name}" (${dependantFactory.id})!`)

          // Filter out the dependency request(s) for the part from the erroneous factory.
          removeDependency(factory, dependantFactory, request.part)

          // Delete the input from the factory that caused the issue.
          dependantFactory.inputs.forEach((input, index) => {
            if (input.factoryId === factory.id && input.outputPart === request.part) {
              dependantFactory.inputs.splice(index, 1)
            }
          })
        }

        // Check the other end for invalid inputs
        const foundInput = dependantFactory.inputs.find(input => input.factoryId === factory.id && input.outputPart === request.part)
        if (!foundInput) {
          console.warn(`flushInvalidRequests: Found invalid input for "${factory.name}" (${factory.id}) was requesting ${request.part} from "${dependantFactory.name}" (${dependantFactory.id}) where it does not exist.`, foundInput)

          // Filter out the dependency request(s) for the part from the erroneous factory.
          removeDependency(factory, dependantFactory, request.part)
        }

        // If all requests from the factory have been removed, also delete the key.
        if (factory.dependencies.requests[requestedFactoryId].length === 0) {
          delete factory.dependencies.requests[requestedFactoryId]
        }
      })
    })
  })
}

export const removeFactoryDependants = (factory: Factory, factories: Factory[]) => {
  // Remove the inputs from factories that depend on this factory
  if (factory.dependencies?.requests) {
    const dependents = factory.dependencies?.requests

    Object.keys(dependents).forEach(dependentId => {
      const dependent = findFac(dependentId, factories)
      if (!dependent) {
        console.error(`Dependent factory ${dependentId} not found!`)
        return
      }
      dependent.inputs = dependent.inputs.filter(input => input.factoryId !== factory.id)

      // Remove the dependency from the calling factory
      // Not that this massively matters as the factory is likely getting deleted
      delete factory.dependencies.requests[factory.id]
    })
  }
}

// Loop through all factories, checking their inputs and building a dependency tree.
export const calculateDependencies = (factories: Factory[], gameData: DataInterface, loadMode = false): void => {
  flushInvalidRequests(factories)

  factories.forEach(factory => {
    calculateFactoryDependencies(factory, factories, gameData, loadMode)
  })
}

// This function checks a factory's inputs and generates the dependency data.
// It also checks if the provider factory has the part that the dependant factory is requesting, and if it exists.
export const calculateFactoryDependencies = (
  factory: Factory,
  factories: Factory[],
  gameData: DataInterface,
  loadMode = false
): void => {
  const providersToRecalculate = new Set<number>()

  factory.inputs.forEach(input => {
    // Handle the case where the user is mid-way selecting an input.
    if (input.factoryId === 0 || !input.outputPart) {
      console.warn(`Factory ${factory.id} has an incomplete input. User may still be selecting it.`)
      return
    }

    // Stop if the factory input is somehow the same as the factory itself.
    if (input.factoryId === factory.id) {
      throw new Error(`Factory ${factory.id} is trying to add a dependency to itself!`)
    }

    const provider = factories.find(fac => fac.id === input.factoryId)
    if (!provider) {
      console.error(`Factory with ID ${input.factoryId} not found.`)

      // Remove it from the inputs if this is the case as it's invalid.
      factory.inputs = factory.inputs.filter(i => i !== input)
      return
    }

    // Check if the provider factory has the part that the dependant factory is requesting.
    if (!loadMode && !provider.parts[input.outputPart]) {
      console.error(`Factory ${provider.name} (${provider.id}) does not have the part ${input.outputPart} requested by ${factory.name} (${factory.id}). Removing input.`)
      factory.inputs = factory.inputs.filter(i => i !== input)
      return
    }

    updateDependency(factory, provider, input)
    providersToRecalculate.add(provider.id)
  })

  // console.log('dependencies: providersToRecalculate', providersToRecalculate)

  // For any providers affected we now need to recalculate their metrics.
  providersToRecalculate.forEach(providerId => {
    const provider = factories.find(fac => fac.id === providerId)
    if (!provider) {
      console.error(`Provider factory with ID ${providerId} not found.`)
      return
    }
    calculateDependencyMetrics(provider)
    // Since their parts have likely changed, their parts too
    calculateParts(provider, gameData)
    calculateDependencyMetricsSupply(provider)
  })
}

export const removeDependency = (factory: Factory, dependantFactory: Factory, part?: string) => {
  if (!factory.dependencies.requests[dependantFactory.id]) {
    return
  }

  if (part) {
    factory.dependencies.requests[dependantFactory.id] = factory.dependencies.requests[dependantFactory.id].filter(req => req.part !== part)
  } else {
    delete factory.dependencies.requests[dependantFactory.id]
  }
}

// Calculate the dependency metrics for the factory.
export const calculateDependencyMetrics = (factory: Factory) => {
  // console.log('dependencies: calculateDependencyMetrics: ' + factory.name)
  // Reset the metrics for the factory
  factory.dependencies.metrics = {}

  Object.keys(factory.dependencies.requests).forEach(reqFac => {
    const requests = factory.dependencies.requests[reqFac]
    requests.forEach(request => {
      const part = request.part
      const metrics = factory.dependencies.metrics

      if (!metrics[part]) {
        metrics[part] = {
          part,
          request: 0,
          supply: 0, // At this stage it cannot be calculated
          isRequestSatisfied: false, // Calculated later
          difference: 0, // Calculated later
        }
      }

      metrics[part].request += request.amount
    })
  })
}

// Calculates after parts have been calculated whether dependencies are properly supplied.
export const calculateDependencyMetricsSupply = (factory: Factory) => {
  Object.keys(factory.dependencies.metrics).forEach(part => {
    const metrics = factory.dependencies.metrics[part]
    metrics.supply = factory.parts[part].amountSupplied
    metrics.difference = metrics.supply - metrics.request
    metrics.isRequestSatisfied = metrics.difference >= 0
  })
}
