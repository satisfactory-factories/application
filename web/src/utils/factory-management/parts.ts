// Calculate the remaining amount of parts required after all inputs and internal products are accounted for.
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { getRequestsForFactory } from '@/utils/factory-management/exports'
import { DataInterface } from '@/interfaces/DataInterface'
import { createNewPart, getPowerRecipe } from '@/utils/factory-management/common'
import { getEndProducts } from '@/utils/factory-management/end-products'
import { isSinkablePart } from '@/utils/factory-management/sinkable'

// A building group solved against a target has to express its clock in the four decimal places
// the game allows, so it can land a hair under and stay there — a 10,000/min line comes out about
// 0.009 short, which reads as a red factory nothing the user does can fix. Four decimal places of
// a percentage is a relative precision of 1e-6, so that is the size of shortfall the clock itself
// could not have corrected. The floor covers small amounts, where quantities are stored to three
// decimal places. calculateBuildingGroupProblems already allows 0.1 of a building for this.
const CLOCK_PRECISION_RELATIVE = 1e-6
const MIN_SATISFACTION_TOLERANCE = 0.001

// Nudged outward by a relative epsilon, so the comparison is not decided by float rounding at the
// very point the tolerance exists to cover. Quantities are stored to three decimal places, so a
// shortfall of EXACTLY MIN_SATISFACTION_TOLERANCE is ordinary rather than exotic — and whether
// `supplied - required` lands a hair above or below it depends on the magnitudes involved, not on
// anything the user did. A 0.001 shortfall was forgiven at 10, 50, 600, 1000 and 5000/min and NOT
// at 100, 123 or 200, where the subtraction happens to produce -0.0010000000000047748. The user
// cannot clear those: three decimal places is the finest quantity the planner stores.
const TOLERANCE_SLACK = 1 + 1e-9

// The one definition of "close enough at this scale", so the two questions below cannot drift.
const toleranceFor = (required: number): number =>
  Math.max(MIN_SATISFACTION_TOLERANCE, Math.abs(required) * CLOCK_PRECISION_RELATIVE) * TOLERANCE_SLACK

export const isAmountSatisfied = (remaining: number, required: number): boolean =>
  remaining >= -toleranceFor(required)

/**
 * Is what is left over actually worth reporting, or is it arithmetic noise?
 *
 * The mirror of isAmountSatisfied, and deliberately sharing its scale. A caller that restates the
 * rule as a flat constant diverges from the engine as the numbers grow: at 100,000/min a flat
 * 0.001 is a hundred times stricter than the tolerance the engine just used to call the same line
 * balanced, so it would report a surplus on a line the planner considers met.
 */
export const isSurplusSignificant = (remaining: number, required: number): boolean =>
  remaining > toleranceFor(required)

export const calculateParts = (factory: Factory, gameData: DataInterface) => {
  calculatePartMetrics(factory, gameData)

  // If factory has no products there is nothing for us to do, so mark as satisfied.
  if (factory.products.length === 0) {
    factory.requirementsSatisfied = true
    return
  }

  // Now check if all requirements are satisfied and flag so if it is.
  factory.requirementsSatisfied = Object.keys(factory.parts).every(part => factory.parts[part].satisfied)

  // If we're only using raw resources flag it as such.
  // This needs to check if all parts used for production are raw resources, not just the parts themselves are raw.
  factory.usingRawResourcesOnly = true
  for (const part in factory.parts) {
    const partData = factory.parts[part]
    if (!partData.isRaw && partData.amountRequiredProduction > 0) {
      factory.usingRawResourcesOnly = false
      break
    }
  }
}

// This is where the meat of the soup is!
// This calculates all the parts in the factory and checks if they are satisfied.
export const calculatePartMetrics = (factory: Factory, gameData: DataInterface) => {
  factory.parts = {}
  factory.rawResources = {}

  calculatePartRequirements(factory, gameData)
  calculatePartSupply(factory)
  calculatePartRaw(factory, gameData)
  calculateExportable(factory)

  const endProducts = getEndProducts(gameData)

  // Now we calculate the remaining amount of parts required after all inputs and internal products are accounted for.
  for (const part in factory.parts) {
    // If for some reason the part key is an empty string, remove it.
    if (part === '') {
      console.error('calculatePartMetrics: Part key is an empty string! Flushing part data.', factory.parts)
      delete factory.parts[part]
      return
    }

    const partData = factory.parts[part]

    // A fact about the game rather than about this plan, but it belongs on the part for the same
    // reason isRaw does: every display site already has the part and none of them have game data.
    partData.isEndProduct = endProducts.has(part)
    partData.isSinkable = isSinkablePart(part, gameData)

    // Sum up remaining amount
    partData.amountRemaining = partData.amountSupplied - partData.amountRequired

    // Now calculate if satisfied
    partData.satisfied = isAmountSatisfied(partData.amountRemaining, partData.amountRequired)
  }
}

export const calculatePartRequirements = (factory: Factory, gameData: DataInterface) => {
  // Get the amount required by production
  factory.products.forEach(product => {
    createNewPart(factory, product.id)

    // Loop through the product requirements
    for (const part in product.requirements) {
      if (!product.requirements[part]?.amount) {
        console.error('calculatePartRequirements - products: Amount is missing from product!', product)
        return
      }

      createNewPart(factory, part)

      // Loop the product requirements and pick out if it matches the part
      factory.parts[part].amountRequiredProduction += product.requirements[part].amount
    }
  })

  // Get the amount required by power production
  factory.powerProducers.forEach(producer => {
    if (producer.ingredients.length === 0) {
      // Fuel-less generators (Geothermal, unfueled Alien Power Augmenters) legitimately
      // have no ingredients; only fuel-based recipes missing theirs indicate data damage.
      const recipe = getPowerRecipe(producer.recipe, gameData)
      if (recipe && recipe.ingredients.length > 0) {
        console.error('calculatePartRequirements - powerProducers: Ingredients are missing from producer!', producer)
      }
      return
    }

    producer.ingredients.forEach(ingredient => {
      createNewPart(factory, ingredient.part)
      if (!ingredient.perMin) {
        console.error('calculatePartRequirements - powerProducers: perMin is missing from ingredient!', ingredient)
        return
      }
      factory.parts[ingredient.part].amountRequiredPower += ingredient.perMin
    })
  })

  // Get requirements for export demands
  // Get the amount required by export dependencies
  const requests = getRequestsForFactory(factory)

  requests.forEach(request => {
    createNewPart(factory, request.part)
    factory.parts[request.part].amountRequiredExports += request.amount
  })

  // Sum up requirements
  for (const part in factory.parts) {
    const partData = factory.parts[part]
    partData.amountRequired =
      partData.amountRequiredProduction +
      partData.amountRequiredPower +
      partData.amountRequiredExports
  }
}

// Requires partRequirements to be run first!
export const calculatePartSupply = (factory: Factory) => {
  // Get the amount supplied by inputs
  factory.inputs.forEach(input => {
    if (!input.outputPart) {
      console.error('calculatePartSupply - inputs: Output part is missing from input!', input)
      return
    }
    createNewPart(factory, input.outputPart)
    if (!input.amount) {
      console.error('calculatePartSupply - inputs: Amount is missing from input!', input)
      return
    }
    factory.parts[input.outputPart].amountSuppliedViaInput += input.amount
  })

  // Get the amount supplied by products
  factory.products.forEach(product => {
    if (!product.amount) {
      console.error('calculatePartSupply - products: Amount is missing from product!', product)
      return
    }

    // Add up product amounts
    createNewPart(factory, product.id)
    factory.parts[product.id].amountSuppliedViaProduction += product.amount

    // And byproducts
    product.byProducts?.forEach(byProduct => {
      createNewPart(factory, byProduct.id)
      factory.parts[byProduct.id].amountSuppliedViaProduction += byProduct.amount
    })
  })

  // Get amount supplied by power producers waste
  factory.powerProducers.forEach(producer => {
    if (!producer.byproduct) {
      return
    }

    createNewPart(factory, producer.byproduct.part)
    factory.parts[producer.byproduct.part].amountSuppliedViaProduction += producer.byproduct.amount
  })

  // Sum up supply
  for (const part in factory.parts) {
    const partData = factory.parts[part]

    partData.amountSupplied =
      partData.amountSuppliedViaInput +
      partData.amountSuppliedViaProduction
      // partData.amountSuppliedViaRaw // At this particular point this metric is not calculated, it is done in calculatePartRaw
  }
}

// Raw resources the game gives no extractor for: Leaves, Wood, Mycelia, the alien remains, the
// power slugs and the FICSMAS Gift. Nothing to build and nothing to import, so the planner takes
// them as gathered by hand rather than reporting a shortage nobody could act on.
//
// Wells count as extractors here. Nitrogen Gas is well-only, and classing it hand-gathered would
// erase every Nitrogen shortage in every plan. getExtractionRecipeForPart deliberately excludes
// wells, but it answers a different question — "can this be created automatically", not "does an
// extractor exist at all". Don't swap one for the other.
const handGatheredCache = new WeakMap<DataInterface, Set<string>>()

export const getHandGatheredParts = (gameData: DataInterface): Set<string> => {
  const cached = handGatheredCache.get(gameData)
  if (cached) {
    return cached
  }

  const extractable = new Set<string>()
  for (const recipe of gameData.recipes) {
    if (recipe.extraction) {
      recipe.products.forEach(product => extractable.add(product.part))
    }
  }

  // Keyed on the game data object rather than built once: this is parameterised by gameData, and
  // specs pass their own. A stale set would mark ores permanently satisfied.
  const handGathered = new Set(
    Object.keys(gameData.items.rawResources).filter(part => !extractable.has(part))
  )
  handGatheredCache.set(gameData, handGathered)
  return handGathered
}

export const calculatePartRaw = (factory: Factory, gameData: DataInterface) => {
  const handGathered = getHandGatheredParts(gameData)

  for (const part in factory.parts) {
    const partData = factory.parts[part]

    // Check if the part is a raw resource
    const rawItem = gameData.items.rawResources[part]
    partData.isRaw = !!rawItem

    if (!partData.isRaw) {
      continue // Nothing else to do
    }

    // The shortfall left after inputs and internal production (extraction, or unpackaging
    // Packaged Oil into Crude Oil) are accounted for. Counting the whole requirement here
    // would double up that supply. Fixes #431.
    const shortfall = Math.max(0,
      partData.amountRequired -
      partData.amountSuppliedViaInput -
      partData.amountSuppliedViaProduction
    )

    // Hand-gathered resources are taken as supplied. Everything else has to be mined or imported,
    // so its shortfall stays unmet and flows through amountRemaining as a genuine shortage.
    partData.amountSuppliedViaRaw = handGathered.has(part) ? shortfall : 0

    partData.amountSupplied =
      partData.amountSuppliedViaInput +
      partData.amountSuppliedViaProduction +
      partData.amountSuppliedViaRaw

    // Fill the rawResources array with what the world has to provide either way — when the
    // assumption is off this is what the factory is short of, which is worth showing.
    if (shortfall > 0) {
      if (!factory.rawResources[part]) {
        factory.rawResources[part] = {
          id: part,
          name: rawItem.name,
          amount: 0,
        }
      }
      factory.rawResources[part].amount += shortfall
    }
  }
}

// This function calculates what is produced internally for the factory and flags it as exportable.
export const calculateExportable = (factory: Factory) => {
  for (const part in factory.parts) {
    const partData = factory.parts[part]

    if (partData.amountRequiredExports > 0) {
      partData.exportable = true
    }

    if (partData.amountSuppliedViaProduction > 0) {
      partData.exportable = true
    }
  }
}
