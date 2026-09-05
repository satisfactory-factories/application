import { toRaw } from 'vue'
import { Factory, FactoryDependencyRequest, FactoryInput } from '@/interfaces/planner/FactoryInterface'
import { calculateFactory, findFac } from '@/utils/factory-management/factory'
import { calculateParts, isAmountSatisfied } from '@/utils/factory-management/parts'
import { DataInterface } from '@/interfaces/DataInterface'
import { rawArray } from '@/utils/factory-management/common'
import { recordEvent } from '@/utils/record-event'

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
    factory.inputs = rawArray(factory.inputs.filter(i => i !== input))
    alert(errorMsg)
    recordEvent('calc_dependency_error_alert')
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

// An empty request array still renders as an export ("Factory X" with no parts against it),
// so a key that has lost its last request must go with it.
const pruneEmptyRequests = (factory: Factory): void => {
  Object.keys(factory.dependencies.requests).forEach(requestedFactoryId => {
    if (factory.dependencies.requests[requestedFactoryId]?.length === 0) {
      delete factory.dependencies.requests[requestedFactoryId]
    }
  })
}

// Scans for invalid dependency requests and removes the request and the input from the erroneous factory.
/**
 * Factories whose own calculation pass has run to completion in this session.
 *
 * Deliberately a WeakSet rather than a field on Factory: it is transient bookkeeping about a
 * calculation, not part of a saved plan, and it must never reach localStorage or the API. Clones
 * made for a calculation run start unmarked, which is correct — a fresh run has to re-establish
 * it. Marked by the engine at the end of every pass; see calculateFactoryEngine.
 */
const completedPass = new WeakSet<Factory>()

// Always keyed on the RAW object. The live plan is a Vue reactive array, so reading an element out
// of it hands back a proxy, while cloneForCalculation reads through toRaw — mark the proxy and the
// next calculation looks up the raw, finds nothing, and treats a long-calculated plan as brand new.
// Every spec in the repo builds plans as plain arrays, where proxy and raw are the same object, so
// that failed only in the app.
const rawOf = (factory: Factory): Factory => toRaw(factory)

export const markPassCompleted = (factory: Factory): void => {
  completedPass.add(rawOf(factory))
}

export const hasCompletedPass = (factory: Factory): boolean => completedPass.has(rawOf(factory))

/**
 * A clone is the same factory, so it inherits whether that factory has been calculated.
 *
 * Without this a single-factory recalculation could never judge anything: it clones the plan and
 * flushInvalidRequests runs at the very START of the pass, so every clone would still be unmarked
 * and a genuinely dead export would survive forever.
 */
export const carryPassMarks = (sources: Factory[], clones: Factory[]): Factory[] => {
  sources.forEach((source, index) => {
    if (clones[index] && completedPass.has(rawOf(source))) {
      completedPass.add(rawOf(clones[index]))
    }
  })
  return clones
}

export const flushInvalidRequests = (factories: Factory[], gameData: DataInterface): void => {
  // console.log('dependencies: flushInvalidRequests')
  factories.forEach(factory => {
    // If there's no requests, nothing to do.
    if (!factory.dependencies?.requests || Object.keys(factory.dependencies.requests).length === 0) {
      return
    }

    pruneEmptyRequests(factory)

    // Scan all requests for the factory
    Object.keys(factory.dependencies.requests).forEach(requestedFactoryId => {
      // deleteRequestPair recalculates both affected factories mid-loop, which rewrites this
      // array (and can strip the key entirely, e.g. when a copied factory carries its
      // original's requests). Iterate a snapshot and re-read the live array as we go.
      const requests: FactoryDependencyRequest[] = [...(factory.dependencies.requests[requestedFactoryId] ?? [])]

      if (requests.length === 0) {
        return
      }

      const dependantFactory = findFac(requestedFactoryId, factories)
      // If the factory doesn't exist, somehow this data corrupted, clean it up now.
      if (!dependantFactory?.id || !dependantFactory?.inputs) {
        console.error(`flushInvalidRequests: Requested factory ${requestedFactoryId} not found!`)
        delete factory.dependencies.requests[requestedFactoryId]
        alert(`The factory ${factory.name} has corrupted data and has been cleaned up. Please refresh the page.`)
        recordEvent('calc_dependency_corrupt_alert')
        return // Nothing to do as the factory doesn't exist.
      }

      // A factory that has not completed a pass yet (a template, or a plan built in code) cannot
      // be asked "do you make this?" — the answer is built moments later, and judging it here
      // deletes perfectly good export/import pairs on the plan's very first calculation.
      //
      // This used to be inferred from the part ledger being non-empty, which is NOT the same
      // question and produced an order-dependent bug. The productCheck below reads `byProducts`
      // and the power producers' byproducts, both written by the provider's OWN pass; but
      // calculateFactoryDependencies fills a provider's `parts` as a side effect while
      // processing a CONSUMER. So a provider sitting after its consumer in the array arrived
      // here half-done: parts full, byproducts still empty. It looked calculated, failed the
      // productCheck, and had the import and its matching export silently deleted.
      //
      // Whether that happened depended purely on array order. `[refinery, consumer]` kept the
      // import and `[consumer, refinery]` lost it, on identical data.
      const isCalculated = hasCompletedPass(factory)

      requests.forEach(request => {
        // A previous iteration (or the recalculation it triggered) may already have removed it.
        if (!factory.dependencies.requests[requestedFactoryId]?.includes(request)) {
          return
        }

        // Check if the requested part exists within the factory
        const foundPart = factory.parts[request.part]

        // If the product does not exist, remove the dependency and the input.
        if (isCalculated && !foundPart) {
          console.warn(`flushInvalidRequests: partCheck Factory "${factory.name}" (${factory.id}) does not have the product ${request.part} requested by "${dependantFactory.name}" (${dependantFactory.id})!`)

          deleteRequestPair(factory, dependantFactory, factories, request, gameData)
          pruneEmptyRequests(factory)
          return
        }

        const foundProduct = factory.products.find(product => product.id === request.part)
        const foundByProduct = factory.byProducts.find(byProduct => byProduct.id === request.part)
        const foundPowerProducerByProduct = factory.powerProducers.find(powerProducer => powerProducer.byproduct?.part === request.part)

        // If a part is found, check if the part is produced within the factory. If it isn't, remove the dependency and the input.
        // Thankfully since we are doing the dependency calculation BEFORE the parts calculation, the part data will be eventually correct.
        if (isCalculated && !foundProduct && !foundByProduct && !foundPowerProducerByProduct) {
          console.warn(`flushInvalidRequests: productCheck: Factory "${factory.name}" (${factory.id}) does not produce the product ${request.part} requested by "${dependantFactory.name}" (${dependantFactory.id})!`)

          deleteRequestPair(factory, dependantFactory, factories, request, gameData)
          pruneEmptyRequests(factory)
          return
        }

        // Check the other end for invalid inputs
        const foundInput = dependantFactory.inputs.find(input => input.factoryId === factory.id && input.outputPart === request.part)
        if (!foundInput) {
          console.warn(`flushInvalidRequests: inputCheck: Found invalid input for "${factory.name}" (${factory.id}) was requesting ${request.part} from "${dependantFactory.name}" (${dependantFactory.id}) where it does not exist.`)

          deleteRequestPair(factory, dependantFactory, factories, request, gameData)
          pruneEmptyRequests(factory)
        }
      })

      pruneEmptyRequests(factory)
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
      dependent.inputs = rawArray(dependent.inputs.filter(input => input.factoryId !== factory.id))

      // Remove the dependency from the calling factory
      // Not that this massively matters as the factory is likely getting deleted
      delete factory.dependencies.requests[dependentId]
    })
  }

  // Remove any requests that other factories (e.g. the factory's providers) hold against this factory.
  // If left behind, flushInvalidRequests would falsely flag those factories as corrupted after deletion. GH: #398
  factories.forEach(otherFac => {
    if (otherFac.dependencies?.requests?.[factory.id]) {
      delete otherFac.dependencies.requests[factory.id]
    }
  })
}

// Loop through all factories, checking their inputs and building a dependency tree.
export const calculateAllDependencies = (factories: Factory[], gameData: DataInterface, loadMode = false): void => {
  flushInvalidRequests(factories, gameData)

  factories.forEach(factory => {
    calculateFactoryDependencies(factory, factories, gameData, loadMode)
  })
}

// Lighter version of the allDependencies when only one factory needs to be recalculated.
export const recalculateFactoryDependencies = (factory: Factory, factories: Factory[], gameData: DataInterface): void => {
  flushInvalidRequests(factories, gameData)

  calculateFactoryDependencies(factory, factories, gameData)
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

  // A part can legitimately be imported from the same factory more than once (a plan saved
  // before the UI blocked it, or a share link). One request per provider+part is what the
  // export side renders, so the amounts are totalled rather than the last one winning.
  const totals = new Map<string, { provider: Factory, input: FactoryInput, amount: number }>()

  factory.inputs.forEach(input => {
    // Handle the case where the user is mid-way selecting an input.
    if (input.factoryId === 0 || !input.outputPart) {
      console.warn(`Factory ${factory.id} has an incomplete input. User may still be selecting it.`)
      return
    }

    // A factory cannot import from itself. Corrupt data, not a user action — drop the input
    // rather than throwing, which would abort the whole plan's calculation.
    if (input.factoryId === factory.id) {
      console.error(`dependencies: calculateFactoryDependencies: Factory ${factory.id} is trying to add a dependency to itself! Removing input.`)
      factory.inputs = rawArray(factory.inputs.filter(i => i !== input))
      return
    }

    const provider = factories.find(fac => fac.id === input.factoryId)
    if (!provider) {
      console.error(`Factory with ID ${input.factoryId} not found.`)

      // Remove it from the inputs if this is the case as it's invalid.
      factory.inputs = rawArray(factory.inputs.filter(i => i !== input))
      return
    }

    // Check if the provider factory has the part that the dependant factory is requesting.
    // A provider with no part ledger at all has not been calculated yet — its ledger is
    // built moments later, and concluding "it doesn't make this" from an empty one deletes
    // valid imports. deleteRequestPair recalculates mid-flush, which is how that happens
    // even when the caller passed loadMode.
    const providerCalculated = Object.keys(provider.parts).length > 0
    if (!loadMode && providerCalculated && !provider.parts[input.outputPart]) {
      console.error(`dependencies: calculateFactoryDependencies: Factory ${provider.name} (${provider.id}) does not have the part ${input.outputPart} requested by ${factory.name} (${factory.id}). Removing input.`)
      factory.inputs = rawArray(factory.inputs.filter(i => i !== input))
      return
    }

    const key = `${provider.id}-${input.outputPart}`
    const existing = totals.get(key)
    if (existing) {
      existing.amount += input.amount
    } else {
      totals.set(key, { provider, input, amount: input.amount })
    }
  })

  totals.forEach(({ provider, input, amount }) => {
    updateDependency(factory, provider, { ...input, amount })
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
    factory.dependencies.requests[dependantFactory.id] = rawArray(
      factory.dependencies.requests[dependantFactory.id].filter(req => req.part !== part)
    )
  }

  // An empty array still shows up as an export against the dependant's name.
  if (!part || factory.dependencies.requests[dependantFactory.id].length === 0) {
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
    const partData = factory.parts[part]

    // What the factory has spare, not what it makes. #540: this read amountSupplied, so a mine
    // extracting 480 ore and smelting all 480 itself still offered 240 of it for export.
    //
    // The + undoes a subtraction. amountRequired includes exports, so amountRemaining already has
    // them taken off; adding them back leaves the pool those exports draw on.
    metrics.supply = partData.amountRemaining + partData.amountRequiredExports
    metrics.difference = metrics.supply - metrics.request
    metrics.isRequestSatisfied = isAmountSatisfied(metrics.difference, metrics.request)
  })
}

export const deleteRequestPair = (
  factory: Factory,
  dependantFactory: Factory,
  factories:Factory[],
  request: FactoryDependencyRequest,
  gameData: DataInterface
) => {
  // Filter out the dependency request(s) for the part from the erroneous factory.
  removeDependency(factory, dependantFactory, request.part)

  // Delete any inputs from the requesting factory. Filtered rather than spliced in a loop,
  // which skips the element after each removal when the part is imported more than once.
  dependantFactory.inputs = rawArray(dependantFactory.inputs.filter(
    input => !(input.factoryId === factory.id && input.outputPart === request.part)
  ))

  // Recalculate the both factories now as the part demand has changed likely for both.
  calculateFactory(factory, factories, gameData)
  calculateFactory(dependantFactory, factories, gameData)
}
