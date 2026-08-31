// This simply loops through all the inputs and adds them to the parts object.
import { Factory, FactoryInput } from '@/interfaces/planner/FactoryInterface'
import { calculateFactory, findFac } from '@/utils/factory-management/factory'
import { recalculateFactoryDependencies } from '@/utils/factory-management/dependencies'
import { DataInterface } from '@/interfaces/DataInterface'
import { getPartExportRequests } from '@/utils/factory-management/exports'
import eventBus from '@/utils/eventBus'
// Re-exported so existing callers keep importing them from here; they live in a leaf module
// because status.ts needs them and cannot import anything that reaches factory.ts.
export { importRowId, isDuplicateImport, isImportRedundant } from '@/utils/factory-management/inputs-analysis'

export const getInput = (factory: Factory, part: string, factoryId?: number) => {
  // Returns a SINGULAR input object by the outputPart. If multiple are detected, throw.
  const inputs = getAllInputs(factory, part, factoryId)
  if (inputs.length > 1) {
    throw new Error(`inputs: getInputByPart: Multiple inputs found for part ${part} in factory ${factory.id} detected!`)
  }
  return inputs[0]
}

export const getAllInputs = (factory: Factory, part: string, factoryId?: number) => {
  return factory.inputs.filter(input =>
    input.outputPart === part &&
      (factoryId ? input.factoryId === factoryId : true)
  )
}

export const addInputToFactory = (
  factory: Factory, options: {
    factoryId: number | null,
    outputPart: string | null,
    amount: number,
  }
) => {
  if (options.factoryId && options.outputPart) {
    // Find any factory that has the same factoryId, outputPart combo as we're trying to add, if there is any throw an error
    const existingInput = getInput(factory, options.outputPart, options.factoryId)
    if (existingInput) {
      throw new Error(`addInputToFactory: Input with factoryId ${options.factoryId} and outputPart ${options.outputPart} already exists in factory ${factory.id}`)
    }
  }

  factory.inputs.push({
    factoryId: options.factoryId,
    outputPart: options.outputPart,
    amount: options.amount,
    completed: false,
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
      const partData = importFac.parts[part]
      if (partsWithRequirements.includes(part) && partData.exportable) {
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
  const selectedFactoryParts = new Set<string>()
  const partsWithRequirements = getPartsWithRequirements(factory)

  // Construct the selectedFactoryParts map from the inputs of the factory
  factory.inputs.forEach((input, index) => {
    if (index === inputIndex) return // Don't include the current input
    if (!input.outputPart) return // If there's no output part, skip
    selectedFactoryParts.add(`${input.factoryId}-${input.outputPart}`)
  })

  // Go through the input factory's parts and see if they're available to be selected.
  // Using Sets like this ensures uniqueness and prevents duplicate inputs.
  Object.keys(inputFactory.parts).forEach(part => {
    const selectedPartKey = `${inputFactory.id}-${part}`
    const partData = inputFactory.parts[part]

    if (
      partsWithRequirements.includes(part) &&
      !selectedFactoryParts.has(selectedPartKey) &&
      partData.exportable
    ) {
      availableInputParts.add(part)
    }
  })

  // availableInputParts is a set of parts that are available to be selected from the input factory. Return just the parts, the component will adjust it for the selector.
  return Array.from(availableInputParts)
}

export const calculateAbleToImport = (factory: Factory, importCandidates: Factory[]): string | boolean => {
  if (
    factory.products.length === 0 &&
    factory.powerProducers.length === 0 &&
    (factory.customBuildings?.length ?? 0) === 0
  ) {
    return 'noProductsOrProducers'
  }

  // A mine that only extracts has nothing to import: extraction takes no ingredients.
  //
  // #541: exports are demand too. A mine promising away more ore than it extracts IS short, and
  // another mine can cover it, so it needs its Add Import button.
  //
  // Each demand is checked separately rather than via amountRequired, because that also carries
  // amountRequiredSink. A mine sinking its own surplus has nothing to import and belongs here.
  const parts = Object.values(factory.parts)
  if (parts.length > 0 && parts.every(part =>
    part.isRaw &&
    part.amountRequiredProduction === 0 &&
    part.amountRequiredPower === 0 &&
    part.amountRequiredExports === 0 &&
    (part.amountRequiredBuildings ?? 0) === 0
  )) {
    return 'producesRawOnly'
  }

  // A factory whose demand is entirely raw used to have nothing to import, because its supply was
  // assumed. Now importing from a mine factory is exactly what it should be doing.
  if (importCandidates.length === 0) {
    return 'noImportFacs'
  }

  return true
}

// The quantity satisfyImport would set, without setting it. The Satisfy and Trim buttons name it,
// so the user can see what they are agreeing to before pressing rather than after.
export const satisfyImportTarget = (importIndex: number, factory: Factory): number | null => {
  const input = factory.inputs[importIndex]
  if (!input?.outputPart) {
    return null // The user is still filling the row in.
  }

  const partData = factory.parts[input.outputPart]
  if (!partData) {
    return null
  }

  // Gather all the other imports of the same part
  const otherImports = factory.inputs.filter((_, index) =>
    index !== importIndex &&
    factory.inputs[index].outputPart === input.outputPart
  )

  // Calculate the total amount of the part that is being imported
  const totalImported = otherImports.reduce((acc, input) => {
    return acc + input.amount
  }, 0)

  // Calculate the remaining amount of the part that needs to be imported
  const difference = partData.amountRequired -
    partData.amountSuppliedViaProduction -
    totalImported

  return difference > 0 ? difference : 0 // Don't set it to negatives
}

export const satisfyImport = (importIndex: number, factory: Factory): void | null => {
  const input = factory.inputs[importIndex]
  if (!input.outputPart) {
    console.error('updateInputToSatisfy: No output part selected for input:', input)
    return null
  }

  input.amount = satisfyImportTarget(importIndex, factory) as number
}

// How much of the import's part the provider can actually spare for THIS import row.
//
// "Satisfy" sizes an import against what the importing factory needs; this is the other side of
// the same question — a factory can happily ask for 1,015 Dark Matter Residue from a provider
// that only makes 900, and the shortage shows up on the provider rather than on the row that
// caused it. The capacity is what the provider has left after it feeds its own production lines
// and power generators, and after every promise it has already made to OTHER factories.
//
// The importing factory's own requests are deliberately excluded — this row is the one being
// sized — but its other rows against the same provider and part are not, since those are
// separate promises the provider still has to keep.
export const calculateImportCapacity = (
  importIndex: number,
  factory: Factory,
  provider: Factory
): number | null => {
  const input = factory.inputs[importIndex]

  if (!input?.outputPart) {
    return null // The user is still filling the row in.
  }

  const partData = provider.parts[input.outputPart]

  if (!partData) {
    // The provider stopped making the part. calculateFactoryDependencies prunes the input on the
    // next pass; until then there is no capacity to report.
    return null
  }

  const consumedByProvider = partData.amountRequiredProduction +
    partData.amountRequiredPower +
    (partData.amountRequiredBuildings ?? 0)

  const promisedToOthers = getPartExportRequests(provider, input.outputPart)
    .filter(request => request.requestingFactoryId !== factory.id)
    .reduce((acc, request) => acc + request.amount, 0)

  const otherRowsFromProvider = factory.inputs.reduce((acc, otherInput, index) => {
    if (index === importIndex) return acc
    if (otherInput.factoryId !== provider.id) return acc
    if (otherInput.outputPart !== input.outputPart) return acc
    return acc + (otherInput.amount ?? 0)
  }, 0)

  const capacity = partData.amountSupplied - consumedByProvider - promisedToOthers - otherRowsFromProvider

  return capacity > 0 ? capacity : 0
}

// Whether the row is asking the provider for more than it can supply, which is what puts the
// "Trim to Export Capacity" button on screen. A capacity of 0 leaves nothing to trim TO — the row is
// entirely unsupportable, and snapping it to 0 would only trip the <=0 guard in validateInput.
export const importExceedsCapacity = (
  importIndex: number,
  factory: Factory,
  provider: Factory
): boolean => {
  const capacity = calculateImportCapacity(importIndex, factory, provider)

  if (capacity === null || capacity <= 0) {
    return false
  }

  return factory.inputs[importIndex].amount > capacity
}

// Shrinks the import down to what the provider can actually supply. Never grows it: a row that
// already fits is left exactly as the user set it.
export const trimImportToCapacity = (
  importIndex: number,
  factory: Factory,
  provider: Factory
): void | null => {
  const capacity = calculateImportCapacity(importIndex, factory, provider)

  if (capacity === null) {
    console.error('inputs: trimImportToCapacity: No capacity could be calculated for import:', factory.inputs[importIndex])
    return null
  }

  const input = factory.inputs[importIndex]

  if (input.amount <= capacity) {
    return // Already within capacity, nothing to trim.
  }

  input.amount = capacity
}

// The quantity that fills as much of this factory's shortfall as the provider can actually cover:
// the Satisfy target, capped at the provider's spare capacity.
//
// Satisfying a request the provider cannot meet used to be a two-press affair — Satisfy took the
// row to the full 5,000 this factory needs, which immediately over-asked a provider with 2,600
// spare, and Trim to Capacity then took it back down to 2,600. This lands on the 2,600 in one go.
export const satisfyImportToCapacityTarget = (
  importIndex: number,
  factory: Factory,
  provider: Factory
): number | null => {
  const need = satisfyImportTarget(importIndex, factory)
  const capacity = calculateImportCapacity(importIndex, factory, provider)

  if (need === null || capacity === null) {
    return null // The user is still filling the row in.
  }

  return Math.min(need, capacity)
}

// Whether the row is worth offering a "Satisfy to Capacity" for, which is only when it says
// something the buttons beside it don't:
//
//  - a capacity of 0 leaves nothing to satisfy to, and would trip the <=0 guard in validateInput
//  - a provider that can cover the whole need makes this identical to Satisfy
//  - a capacity below what the row already asks for makes this identical to Trim to Capacity
export const canSatisfyImportToCapacity = (
  importIndex: number,
  factory: Factory,
  provider: Factory
): boolean => {
  const need = satisfyImportTarget(importIndex, factory)
  const capacity = calculateImportCapacity(importIndex, factory, provider)

  if (need === null || capacity === null || capacity <= 0) {
    return false
  }

  if (capacity >= need) {
    return false
  }

  return capacity > (factory.inputs[importIndex].amount ?? 0)
}

// Grows the import to as much of this factory's shortfall as the provider can actually spare.
export const satisfyImportToCapacity = (
  importIndex: number,
  factory: Factory,
  provider: Factory
): void | null => {
  const target = satisfyImportToCapacityTarget(importIndex, factory, provider)

  if (target === null) {
    console.error('inputs: satisfyImportToCapacity: No target could be calculated for import:', factory.inputs[importIndex])
    return null
  }

  factory.inputs[importIndex].amount = target
}

export const deleteInputPair = (factory: Factory, input: FactoryInput, factories: Factory[], gameData: DataInterface): void => {
  // Remove the exact row the user clicked. Matching on factory + part instead would take
  // every half-configured row (all of which read as null-null) with it.
  const index = factory.inputs.indexOf(input)
  if (index === -1) {
    console.warn('inputs: deleteInputPair: Input no longer present on the factory, nothing to delete.')
    return
  }
  factory.inputs.splice(index, 1)

  // An incomplete row has no supplier to reconcile — it never produced a dependency.
  // findFac returns an empty object rather than throwing, so test the id, not the object.
  const supplyingFactory = input.factoryId ? findFac(input.factoryId, factories) : null

  // Calculate the factory again as it's inputs have now changed
  calculateFactory(factory, factories, gameData)

  if (!supplyingFactory?.id) {
    return
  }

  // Now calculate the dependencies on the other factory, which will remove the dependency on the deleted input and recalculate the parts.
  recalculateFactoryDependencies(supplyingFactory, factories, gameData)
}

export const validateInput = (input: FactoryInput) => {
  // Check if the inputs are valid
  if (!input.amount || input.amount < 0) {
    // If the product amount is negative, this causes issues with calculations, so force it to 0.
    console.warn('inputs: validateInputs: Input amount is <= 0, force setting to 1 to prevent calculation errors.')

    input.amount = 1

    eventBus.emit('toast', {
      message: 'You cannot set an input quantity to be <=0. Setting to 1 to prevent calculation errors. <br>If you need to enter 0.x of numbers, enter a period then the number e.g. ".5".',
      type: 'warning',
    })
  }
}
