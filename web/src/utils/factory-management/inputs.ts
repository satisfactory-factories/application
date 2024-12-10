// This simply loops through all the inputs and adds them to the parts object.
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { findFac } from '@/utils/factory-management/factory'

export const addInputToFactory = (
  factory: Factory, options: {
    factoryId: number | null,
    outputPart: string | null,
    amount: number,
  }
) => {
  // Find any factory that has the same factoryId, outputPart combo as we're trying to add, if there is any throw an error
  if (factory.inputs.find(input => input.factoryId === options.factoryId && input.outputPart === options.outputPart)) {
    throw new Error(`addInputToFactory: Input with factoryId ${options.factoryId} and outputPart ${options.outputPart} already exists in factory ${factory.id}`)
  }

  factory.inputs.push({
    factoryId: options.factoryId,
    outputPart: options.outputPart,
    amount: options.amount,
  })
}

// This returns all factories that have exports available.
export const calculatePossibleImports = (factory: Factory, factoriesWithExports: Factory[]) => {
  if (factoriesWithExports.length === 0) {
    return [] // Nothing to do
  }
  const factoriesWithRequiredParts = new Map<number, Factory>()

  // Get all parts in the factory that have requirements. Do this by checking each item in the parts object for `amountRequired > 0`
  // This denotes parts that should be candidates for import, even if they have an internal production.
  // The list should be simply a list of part names
  const partsWithRequirements = Object.keys(factory.parts).filter(part => {
    return factory.parts[part].amountRequired > 0
  })

  // Loop through each part in the requirements of the current factory prop
  partsWithRequirements.forEach(requiredPart => {
    // Find any factories that are exporting this part
    const validFactories = factoriesWithExports.filter(importFac => {
      // Loop through all the factory's parts and see if they have any export candidates
      return Object.keys(importFac.parts).some(part => {
        const partData = importFac.parts[part]
        return part === requiredPart && partData.exportable
      })
    })

    validFactories.forEach(fac => factoriesWithRequiredParts.set(fac.id, fac))
  })

  // Remove the input's factory to prevent referencing itself
  if (factoriesWithRequiredParts.get(factory.id)) {
    factoriesWithRequiredParts.delete(factory.id)
  }

  const factoriesArray = Array.from(factoriesWithRequiredParts.values())

  // Sort the factories by name
  factoriesArray.sort((a, b) => a.name.localeCompare(b.name))

  return factoriesArray
}

const getPartsWithRequirements = (factory: Factory): string[] => {
  // Get a list of parts that the factory needs
  return Object.keys(factory.parts).filter(part => {
    return factory.parts[part].amountRequired > 0
  })
}

export const calculateImportCandidates = (factory: Factory, possibleImports: Factory[]): Factory[] => {
  if (possibleImports.length === 0) {
    return []
  }

  // Create a list of factory and partID combos that are already in the inputs
  const selectedFactoriesAndParts = new Set<string>()
  factory.inputs.forEach(input => {
    if (input.factoryId && input.outputPart) {
      selectedFactoriesAndParts.add(`${input.factoryId}-${input.outputPart}`)
    }
  })

  const partsWithRequirements = getPartsWithRequirements(factory)

  // Now do the same for possible imports, checking against the partsWithRequirements
  const importCandidates = new Set<string>()
  possibleImports.forEach(importFac => {
    Object.keys(importFac.parts).forEach(part => {
      if (partsWithRequirements.includes(part)) {
        importCandidates.add(`${importFac.id}-${part}`)
      }
    })
  })

  // Now we have a list of possible imports, and a list of already selected imports. Now reduce the import candidate combinations if already selected.
  possibleImports.forEach(importFac => {
    // Loop through the importFac.parts and if there's any parts that are already selected, delete it as a candidate.
    Object.keys(importFac.parts).forEach(part => {
      if (selectedFactoriesAndParts.has(`${importFac.id}-${part}`)) {
        importCandidates.delete(`${importFac.id}-${part}`)
      }
    })
  })

  // Convert candidates back into factories and return
  const uniqueCandidateFactories = new Set<number>()
  importCandidates.forEach(candidate => {
    const [facId, ,] = candidate.split('-')
    uniqueCandidateFactories.add(Number(facId))
  })

  // Finally, return the factories as a unique list
  return Array.from(uniqueCandidateFactories).map(facId => {
    return findFac(facId, possibleImports)
  })
}

// Gets the list of importCandidate factories but also injects the currently selected one as to not break the selector.
export const importFactorySelections = (
  inputIndex: number,
  importCandidates: Factory[],
  factory: Factory,
  allFactories: Factory[]
): { title: string; value: string | number }[] => {
  // Clone the possible candidates array into a Map
  const remainingFactories = new Map(importCandidates.map(fac => [fac.id, fac]))

  // Inject the already selected factory otherwise it'll break the selector.
  if (factory.inputs[inputIndex]?.factoryId) {
    remainingFactories.set(
      factory.inputs[inputIndex].factoryId, findFac(factory.inputs[inputIndex].factoryId, allFactories)
    )
  }

  // Convert Map values to an array and map them to the required format
  return Array.from(remainingFactories.values()).map(factory => ({
    title: factory.name,
    value: factory.id,
  }))
}

// Gets the remaining parts to be selected for the input factory and filters out any parts that have already been selected.
export const importPartSelections = (
  inputFactory: Factory,
  factory: Factory,
  inputIndex: number,
): string[] => {
  const availableInputParts = new Set<string>()
  const selectedParts = new Set<string>()
  const partsWithRequirements = getPartsWithRequirements(factory)

  // Construct the selectedParts map from the inputs of the factory
  factory.inputs.forEach((input, index) => {
    if (index === inputIndex) return // Don't include the current input
    if (!input.outputPart) return // If there's no output part, skip
    selectedParts.add(`${input.outputPart}`)
  })

  // Go through the input factory's parts and see if they're available to be selected
  Object.keys(inputFactory.parts).forEach(part => {
    if (partsWithRequirements.includes(part) && !selectedParts.has(part)) {
      availableInputParts.add(part)
    }
  })

  // availableInputParts is a set of parts that are available to be selected from the input factory. Return just the parts, the component will adjust it for the selector.
  return Array.from(availableInputParts)
}

export const calculateAbleToImport = (factory: Factory, importCandidates: Factory[]): string | boolean => {
  if (factory.products.length === 0) {
    return 'noProducts'
  }

  if (factory.usingRawResourcesOnly) {
    return 'rawOnly'
  }

  if (importCandidates.length === 0) {
    return 'noImportFacs'
  }

  return true
}
