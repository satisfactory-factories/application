import { Factory, FactoryItem, PartMetrics } from '@/interfaces/planner/FactoryInterface'
import { getProduct, shouldShowInternal } from '@/utils/factory-management/products'
import { getAllInputs } from '@/utils/factory-management/inputs'
import { PowerRecipe } from '@/interfaces/Recipes'

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
    default:
      return null
  }
}

export const showAddProduct = (factory: Factory, part: PartMetrics, partId: string) => {
  // If the part is a nuclear waste product, don't show the button, we'll show +Generator instead.
  if (nuclearParts.includes(partId)) {
    return false
  }
  return !getProduct(factory, partId) && !part.isRaw && !part.satisfied
}

export const showFixProduct = (factory: Factory, part: PartMetrics, partId: string) => {
  return getProduct(factory, partId, true) && !part.isRaw && !part.satisfied
}

export const showCorrectManually = (factory: Factory, part: PartMetrics, partId: string) => {
  const isByProduct = factory.byProducts.find(byProduct => byProduct.id === partId)
  // If the product is already a byproduct, isn't raw and isn't satisfied, show it
  if (isByProduct && !part.isRaw && !part.satisfied) {
    return true
  }

  // Beyond a byproduct, we don't care about it's state
  return false
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
export const showRawChip = (factory: Factory, partId: string) => {
  return factory.parts[partId].isRaw
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

  // rodsPerWaste = rodsPerMin / wastePerMin
  const rodsPerWaste = rodsPerMin / wastePerMin // 0.02

  // The total rods needed to get the desired 'amount' of waste
  return rodsPerWaste * amount // 0.5
}
