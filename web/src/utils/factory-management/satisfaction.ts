import { Factory, FactoryItem, PartMetrics } from '@/interfaces/planner/FactoryInterface'
import { addProductToFactory, getProduct, shouldShowInternal } from '@/utils/factory-management/products'
import { addInputToFactory, getAllInputs } from '@/utils/factory-management/inputs'
import { getPartExportRequests } from '@/utils/factory-management/exports'
import { isExtractionRecipe } from '@/utils/factory-management/building-groups/extraction'
import { canPartBeProducedDirectly } from '@/utils/factory-management/common'
import { fetchGameData } from '@/utils/gameDataService'
import { PowerRecipe } from '@/interfaces/Recipes'
import { formatNumberFully } from '@/utils/numberFormatter'

const gameData = await fetchGameData()

const nuclearParts = ['NuclearWaste', 'PlutoniumWaste']

export const showSatisfactionItemButton = (
  factory: Factory,
  partId: string,
  type: string
) => {
  const part = factory.parts[partId]
  if (!part) {
    console.error(`satisfaction: showSatisfactionItemButton: Part ${partId} not found in factory.`)
    return null
  }

  switch (type) {
    case 'addProduct':
      return showAddProduct(factory, part, partId)
    case 'addGenerator':
      return showAddGenerator(factory, part, partId)
    case 'fixProduct':
      return showFixProduct(factory, part, partId)
    case 'fixGenerator':
      return showFixGenerator(factory, part, partId)
    case 'fixGeneratorManually':
      return showFixGeneratorManually(factory, part, partId)
    case 'correctManually':
      return showCorrectManually(factory, part, partId)
    case 'fixImport':
      return showFixImport(factory, part, partId)
    case 'addToFactory':
      return showAddToFactory(factory, part, partId)
    default:
      return null
  }
}

// Hand-gathered raws need no guard in any of these: the engine leaves them satisfied, and every
// predicate below already requires !part.satisfied. An unmet raw part is now a shortage like any
// other — fixed by mining it here or importing it from a mine factory.

// Shown for any shortage that could be produced by another factory (i.e. not nuclear waste).
export const showAddToFactory = (factory: Factory, part: PartMetrics, partId: string) => {
  if (nuclearParts.includes(partId)) {
    return false
  }
  if (part.satisfied) {
    return false
  }
  // Another factory can only make what some factory could make. Offering this for a part with no
  // recipe of its own built a factory with an empty product row and left an import pointing at
  // it, which supplied nothing - Dissolved Silica and the Power Slugs both landed there.
  return canPartBeProducedDirectly(partId, gameData)
}

// Adds the shortage of a part as a product on the target factory, and imports it back into the
// shortage factory so the deficit is actually resolved. Caller is expected to recalculate factories.
//
// `amount` is explicit rather than read from amountRemaining here, so a caller that showed the
// user a number applies that number. Validated rather than absolute-valued: a negative would mean
// a surplus, and silently turning that into production is the bug an abs() would hide.
export const addShortageToFactory = (
  shortageFactory: Factory,
  targetFactory: Factory,
  partId: string,
  recipe: string,
  amount: number,
) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`addShortageToFactory: refusing to add ${amount} of ${partId} to ${targetFactory.name}`)
  }
  const shortage = amount

  const existingProduct = getProduct(targetFactory, partId, true) as FactoryItem | undefined
  if (existingProduct) {
    existingProduct.amount += shortage
  } else {
    addProductToFactory(targetFactory, {
      id: partId,
      amount: shortage,
      recipe,
    })
  }

  const existingInput = getAllInputs(shortageFactory, partId, targetFactory.id)[0]
  if (existingInput) {
    existingInput.amount += shortage
  } else {
    addInputToFactory(shortageFactory, {
      factoryId: targetFactory.id,
      outputPart: partId,
      amount: shortage,
    })
  }
}

export const showAddProduct = (factory: Factory, part: PartMetrics, partId: string) => {
  // If the part is a nuclear waste product, don't show the button, we'll show +Generator instead.
  if (nuclearParts.includes(partId)) {
    return false
  }
  if (part.satisfied) {
    return false
  }
  // Deliberately productOnly: the part already arriving as a byproduct of something else is no
  // reason to refuse making it on purpose as well. Dark Matter Residue drops out of every Quantum
  // Encoder recipe and is also made outright by a Converter, and a factory short of it could add
  // it to any *other* factory but not the one that needed it — which made no sense to anyone.
  if (getProduct(factory, partId, true)) {
    return false
  }
  // Nothing to add if the game has no recipe that makes the part on purpose; those get
  // "Correct Manually" instead.
  return canPartBeProducedDirectly(partId, gameData)
}

export const showFixProduct = (factory: Factory, part: PartMetrics, partId: string) => {
  return getProduct(factory, partId, true) && !part.satisfied
}

// The dead end: a shortage of something this factory only gets as a byproduct, and that the game
// gives no way of making on purpose. Scaling the byproduct means scaling whatever produces it,
// which the planner won't guess at, so the user is told to sort it out themselves.
//
// A part that *can* be made on purpose is not a dead end even while it arrives here as a
// byproduct — it gets "+ Product" (see showAddProduct) instead.
export const showCorrectManually = (factory: Factory, part: PartMetrics, partId: string) => {
  if (part.satisfied) {
    return false
  }

  const isByProduct = factory.byProducts.some(byProduct => byProduct.id === partId)
  if (!isByProduct) {
    return false
  }

  return !canPartBeProducedDirectly(partId, gameData)
}

export const showFixImport = (factory: Factory, part: PartMetrics, partId: string) => {
  const input = getAllInputs(factory, partId)
  if (input.length > 1 && !part.satisfied) {
    return 'multiple'
  }
  return input[0]?.outputPart && !part.satisfied
}

// If the part ID is of a nuclear power product, show the button
export const showAddGenerator = (factory: Factory, part: PartMetrics, partId: string): boolean => {
  if (part.satisfied) return false

  // Attempt to find the powerProducer that produces the part
  const powerProducer = factory.powerProducers.find(producer => producer.byproduct?.part === partId)

  return nuclearParts.includes(partId) && !powerProducer
}
export const showFixGenerator = (factory: Factory, part: PartMetrics, partId: string): boolean => {
  if (part.satisfied) return false
  if (!nuclearParts.includes(partId)) return false

  const powerProducer = factory.powerProducers.filter(producer => producer.byproduct?.part === partId)

  // If a powerProducer is found, return true as it's not satisfied by it.
  return powerProducer.length === 1
}

export const showFixGeneratorManually = (factory: Factory, part: PartMetrics, partId: string): boolean => {
  if (part.satisfied) return false
  if (!nuclearParts.includes(partId)) return false

  // Find all power producers with the part
  const powerProducers = factory.powerProducers.filter(producer => producer.byproduct?.part === partId)

  // If there are multiple power producers, we can't fix it.
  return powerProducers.length > 1
}

// Satisfaction item chips
export const showProductChip = (factory: Factory, partId: string) => {
  return !!getProduct(factory, partId, true)
}
export const showByProductChip = (factory: Factory, partId: string) => {
  return !!getProduct(factory, partId, false, true)
}
export const showImportedChip = (factory: Factory, partId: string) => {
  return getAllInputs(factory, partId).length > 0
}
// Another factory has asked this one for the part — the mirror of the Imported chip.
export const showExportedChip = (factory: Factory, partId: string) => {
  return getPartExportRequests(factory, partId).length > 0
}
// Extraction, import and gathering are independent facts about a part, so they get independent
// predicates. Encoding them as one mutually exclusive value is what once let a factory mining
// 100 of the 180 it needed report as fully satisfied: 'extracted' won, and the assumed 80 was
// never mentioned.

// A raw resource the game gives no extractor for, so the planner takes it as gathered by hand.
// amountSuppliedViaRaw is only ever non-zero for those now, which makes it the whole test.
export const showManuallyGatheredChip = (factory: Factory, partId: string) => {
  const part = factory.parts[partId]
  return !!part?.isRaw && part.amountSuppliedViaRaw > 0
}

// This factory digs the part up itself.
export const showExtractedChip = (factory: Factory, partId: string) => {
  return factory.products.some(product => product.id === partId && isExtractionRecipe(product.recipe))
}

// A raw part this factory neither extracts nor imports enough of.
export const showUnpackagedChip = (factory: Factory, partId: string) => {
  const part = factory.parts[partId]
  if (!part.isRaw) {
    return false
  }
  return factory.products.some(product => product.id === partId && product.recipe.startsWith('Unpackage'))
}
export const showRecycledChip = (factory: Factory, partId: string) => {
  // Only byproducts count as recycled; primary products consumed internally get the Internal chip instead.
  if (!getProduct(factory, partId, false, true) || getProduct(factory, partId, true)) {
    return false
  }

  // The byproduct must actually be consumed within the same factory, e.g. Water from
  // Aluminum Scrap fed back into Alumina Solution. #243
  const part = factory.parts[partId]
  if (!part) {
    return false
  }
  return part.amountRequiredProduction + part.amountRequiredPower + (part.amountRequiredBuildings ?? 0) > 0
}
export const showInternalChip = (factory: Factory, partId: string) => {
  const product = getProduct(factory, partId, true) as FactoryItem
  if (!product) {
    return false
  }
  return shouldShowInternal(product, factory)
}

export const convertWasteToGeneratorFuel = (recipe: PowerRecipe, amount: number) => {
  // In order to get the fuel amount to insert into the UI, we need to do some math.
  // We know the amount of waste we require.
  // We need to get the amount of fuel rods it takes to produce that amount of waste.

  const rodsPerMin = recipe.ingredients[0].perMin // 0.2
  const wastePerMin = recipe.byproduct?.perMin ?? 0 // 10

  const rodsPerWaste = rodsPerMin / wastePerMin // 0.02

  let result = rodsPerWaste * amount // 0.5

  // Since the result may be 0.000x, we need to round it up to the nearest 0.001 to ensure the user can actually achieve it in game
  result = Math.ceil(result * 1000) / 1000

  // The total rods needed to get the desired amount of waste
  return formatNumberFully(result) // 0.5
}
