import { Factory, FactoryPowerChangeType, FactoryPowerProducer, ItemType } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { generateFactoryItemId, getPowerRecipe, hasFractionalClock } from '@/utils/factory-management/common'
import { PowerRecipe } from '@/interfaces/Recipes'
import { formatNumberFully } from '@/utils/numberFormatter'
import { addBuildingGroup } from '@/utils/factory-management/building-groups/common'

// The live path for adding a power generator — ProductsAndPower.vue and the satisfaction item's
// "add a generator" shortcut both come through here, as do the plan fixtures.
export const addPowerProducerToFactory = (
  factory: Factory,
  options: {
    building?: string,
    buildingAmount?: number,
    powerAmount?: number,
    fuelAmount?: number,
    ingredientAmount?: number,
    recipe: string;
    updated: FactoryPowerChangeType // Needed so the power generation can be recalculated in certain ways
  },
) => {
  factory.powerProducers.push({
    // Issued against what the factory already holds: these ids key the game-sync snapshots and
    // the card's element ids, so a collision makes the factory permanently unsyncable (#546).
    id: generateFactoryItemId(factory),
    building: options.building ?? '',
    buildingAmount: options.buildingAmount ?? 0,
    buildingCount: options.buildingAmount ?? 0, // Calculated later
    ingredients: [], // Calculated later
    // ingredientAmount is the fuel (ingredients[0]) rate — same mapping as syncState.
    fuelAmount: options.fuelAmount ?? options.ingredientAmount ?? 0,
    powerAmount: options.powerAmount ?? 0,
    powerProduced: 0, // Calculated later
    recipe: options.recipe,
    byproduct: null,
    displayOrder: factory.powerProducers.length,
    updated: options.updated,
    buildingGroups: [],
    buildingGroupsHaveProblem: false,
    buildingGroupsTrayOpen: false,
    buildingGroupItemSync: true,
    completed: false,
  })

  if (options.building) {
    // Add the default building group for the producer when one is selected, otherwise we have to wait for the user to choose one
    addBuildingGroup(
      factory.powerProducers[factory.powerProducers.length - 1],
      ItemType.Power,
      factory,
    )
  }
}

// Depending on which value is updated, we need to recalculate the power producer in a number of different ways.
export const calculatePowerProducers = (
  factory: Factory,
  gameData: DataInterface
) => {
  factory.powerProducers.forEach(producer => {
    const originalRecipe = getPowerRecipe(producer.recipe, gameData) // Shallow copy the recipe data every time
    if (!originalRecipe) {
      console.error(`Could not find recipe with id: ${producer.recipe}`)
      return
    }

    const recipe = structuredClone(toRaw(originalRecipe))

    // Fuel-less generators (Geothermal, Alien Power Augmenter) have no fuel to derive
    // anything from — their output is a flat building.power per building.
    if (recipe.ingredients.length === 0) {
      calculateFuellessPowerProducer(producer, recipe)
      return
    }

    // Upon initialization or re-selection, the ingredients array is empty, so we need to set it to the recipe ingredients.
    if (!producer.ingredients[0]) {
      producer.ingredients = recipe.ingredients
    }

    if (producer.updated === FactoryPowerChangeType.Building) {
      updateViaBuilding(producer, recipe)
    }

    if (producer.updated === FactoryPowerChangeType.Fuel) {
      updateViaFuel(producer, recipe)
    }

    if (producer.updated === FactoryPowerChangeType.Power) {
      updateViaPower(producer, recipe)
    }

    if (producer.updated === FactoryPowerChangeType.Ingredient) {
      updateViaIngredient(producer, recipe)
    }

    // For supplemental fuels, we need to know the power produced in order to calculate them
    if (producer.ingredients[1]) {
      producer.ingredients[1].perMin = producer.powerProduced * (recipe.ingredients[1].supplementalRatio ?? 0)
    }

    if (producer.updated !== FactoryPowerChangeType.Building) {
      // Now calculate the amount of buildings the user needs to build
      producer.buildingCount = producer.powerProduced / recipe.building.power
    }

    // Now add the byproduct if it exists
    if (recipe.byproduct) {
      const byProductRatio = recipe.byproduct.perMin / recipe.ingredients[0].perMin
      let amount = byProductRatio * producer.ingredients[0].perMin
      if (isNaN(amount)) {
        amount = 0
      }

      producer.byproduct = {
        part: recipe.byproduct.part,
        amount,
      }
    }

    // Whole-number-driven quantities that land a rounding hair off an integer snap to the
    // integer meant, matching what products.ts does. A user-dialled fractional clock is
    // deliberate precision, so those producers keep their exact figures.
    const snap = !hasFractionalClock(producer.buildingGroups)

    // Ensure values are correctly formatted
    producer.buildingAmount = formatNumberFully(producer.buildingAmount, 3, snap)
    producer.buildingCount = formatNumberFully(producer.buildingCount, 3, snap)
    producer.powerAmount = formatNumberFully(producer.powerAmount, 1, snap)
    producer.fuelAmount = formatNumberFully(producer.fuelAmount, 3, snap)
    producer.powerProduced = formatNumberFully(producer.powerProduced, 3, snap)
    producer.ingredients.forEach(ingredient => {
      ingredient.perMin = formatNumberFully(ingredient.perMin, 3, snap)
    })
    if (producer.byproduct) {
      producer.byproduct.amount = formatNumberFully(producer.byproduct.amount, 3, snap)
    }

    // Ensure the amounts match the new reality, so that if they are re-calculated they don't change without the user's say so.
    producer.buildingAmount = producer.buildingCount
    producer.powerAmount = producer.powerProduced
    // Re-format after the raw division, otherwise floating point noise leaks back in
    // (e.g. 250 / 33.333… = 7.499999999999999 instead of 7.5).
    producer.fuelAmount = formatNumberFully(producer.powerProduced / (recipe.ingredients[0].mwPerItem ?? 0), 3, snap)
  })
}

// Geothermal Generators and Alien Power Augmenters produce a flat building.power per
// building — no fuel, no mwPerItem. Only Building and Power changes are meaningful.
export const calculateFuellessPowerProducer = (producer: FactoryPowerProducer, recipe: PowerRecipe) => {
  if (producer.updated === FactoryPowerChangeType.Power) {
    producer.powerProduced = producer.powerAmount
    producer.buildingCount = producer.powerProduced / recipe.building.power
  } else {
    producer.buildingCount = producer.buildingAmount
    producer.powerProduced = recipe.building.power * producer.buildingCount
  }

  producer.fuelAmount = 0
  producer.byproduct = null
  // With no clocks or fuel to fine-tune, unsynced groups offer nothing — keep them synced.
  producer.buildingGroupItemSync = true

  // Alien Power Augmenter: groups toggled to "Supply Matrixes" feed their buildings with
  // Alien Power Matrixes, which creates real fuel demand on the factory's parts ledger.
  if (recipe.boost) {
    const fueledBuildings = (producer.buildingGroups ?? []).reduce((acc, group) =>
      acc + (group.supplyMatrixes ? group.buildingCount : 0), 0)

    producer.ingredients = fueledBuildings > 0
      ? [{ part: recipe.boost.fuelPart, perMin: formatNumberFully(recipe.boost.fuelRatePerMin * fueledBuildings) }]
      : []
  } else {
    producer.ingredients = []
  }

  producer.buildingAmount = formatNumberFully(producer.buildingCount)
  producer.buildingCount = formatNumberFully(producer.buildingCount)
  producer.powerProduced = formatNumberFully(producer.powerProduced)
  producer.powerAmount = producer.powerProduced
}

export const updateViaBuilding = (producer: FactoryPowerProducer, recipe: PowerRecipe) => {
// Replace the building directly
  producer.buildingCount = producer.buildingAmount

  // Now we need to set the ingredients in a ratio equivalent of the amount of buildings
  producer.ingredients[0].perMin = recipe.ingredients[0].perMin * producer.buildingCount
  producer.fuelAmount = producer.ingredients[0].perMin

  // Now we need to increase the power so the supplemental fuel is calculated correctly
  producer.powerProduced = calculatePowerAmount(producer, recipe)
}

export const updateViaFuel = (producer: FactoryPowerProducer, recipe: PowerRecipe) => {
  producer.ingredients[0].perMin = producer.fuelAmount // Replace the ingredient directly

  // Now we've handled the updated values, we can calculate the power generation again
  producer.powerProduced = calculatePowerAmount(producer, recipe)
}

export const updateViaPower = (producer: FactoryPowerProducer, recipe: PowerRecipe) => {
  producer.powerProduced = producer.powerAmount // Simply replace it

  // Now we need to calculate the amount of items produced per minute
  producer.fuelAmount = producer.powerProduced / (recipe.ingredients[0].mwPerItem ?? 0)

  producer.ingredients[0].perMin = producer.fuelAmount
}

export const updateViaIngredient = (producer: FactoryPowerProducer, recipe: PowerRecipe) => {
  // If we don't have a second ingredient, then we can't update via it, so fallback to fuel.
  if (!recipe.ingredients[1]) {
    updateViaFuel(producer, recipe)
    return
  }

  // supplementalRatio represents supplemental ingredient e.g. water per MW produced.
  // Thus, powerProduced can be derived from the water input:
  // water (perMin) = powerProduced * supplementalRatio  -> powerProduced = water / supplementalRatio
  const supplementalRatio = recipe.ingredients[1].supplementalRatio ?? 0
  producer.powerProduced = producer.ingredients[1].perMin / supplementalRatio

  // Calculate fuel amount based on power produced.
  const mwPerItem = recipe.ingredients[0].mwPerItem ?? 0
  producer.fuelAmount = producer.powerProduced / mwPerItem

  // Ensure the fuel ingredient matches the calculated fuel amount.
  producer.ingredients[0].perMin = producer.fuelAmount
}

export const calculatePowerAmount = (
  producer: FactoryPowerProducer,
  recipe: PowerRecipe,
): number => {
  // Simply take the mwPerItem and multiply by the amount of items produced per minute
  const mwPerItem = recipe.ingredients[0].mwPerItem ?? 0
  const amount = producer.fuelAmount
  return mwPerItem * amount
}

// The Alien Power Augmenter's circuit boost applies to the entire power grid (the plan is
// assumed to be one grid): each augmenter adds 10% (30% when fed matrixes) of the TOTAL
// base generation across all factories. Must run after factory.power totals are written.
export const calculateGridBoost = (factories: Factory[], gameData: DataInterface) => {
  let totalBaseGeneration = 0
  factories.forEach(factory => {
    totalBaseGeneration += factory.power?.produced ?? 0
  })

  factories.forEach(factory => {
    if (!factory.power) return

    let boostPercent = 0
    let fueledBuildings = 0
    let unfueledBuildings = 0
    factory.powerProducers.forEach(producer => {
      const boost = getPowerRecipe(producer.recipe, gameData)?.boost
      if (!boost) return

      producer.buildingGroups.forEach(group => {
        if (!group.buildingCount) return
        if (group.supplyMatrixes) {
          fueledBuildings += group.buildingCount
          boostPercent += group.buildingCount * boost.fueled
        } else {
          unfueledBuildings += group.buildingCount
          boostPercent += group.buildingCount * boost.base
        }
      })
    })

    factory.power.boostPercent = formatNumberFully(boostPercent, 4)
    factory.power.boostMw = formatNumberFully(boostPercent * totalBaseGeneration, 1)
    factory.power.boostFueledBuildings = fueledBuildings
    factory.power.boostUnfueledBuildings = unfueledBuildings
  })
}

// ---------------------------------------------------------------------------
// Matching a generator's fuel draw to what the factory can supply
// ---------------------------------------------------------------------------
//
// A generator burning fuel the factory makes itself is the one consumer the planner can settle
// without the user reaching for a calculator: the fuel's supply is known, every other claim on it
// (production, exports, the other generators) is known, and what is left over is exactly what this
// generator may burn. The three functions below mirror products.ts's shouldShowFix /
// fixProductTarget / fixProduct, and are shaped the same way so the two rows behave alike.

// The fuel a producer burns — ingredients[0], the same convention power.ts uses throughout.
// Null for the generators whose draw is not the user's to dial: Geothermal has no fuel at all, and
// an Alien Power Augmenter's matrix demand is synthesised from its building groups
// (see calculateFuellessPowerProducer), so a rate set here would be overwritten on the next pass.
export const producerFuelPart = (
  producer: FactoryPowerProducer,
  gameData: DataInterface
): string | null => {
  if (!producer.recipe || !producer.building) {
    return null
  }

  const recipe = getPowerRecipe(producer.recipe, gameData)
  if (!recipe || recipe.ingredients.length === 0) {
    return null
  }

  return producer.ingredients[0]?.part ?? null
}

// The fuel rate that would leave the part exactly balanced, without setting it. The buttons name
// this figure, so the user can see what they are agreeing to before pressing rather than after.
//
// amountRemainingPreSink carries the whole calculation: it is supply minus every claim on the
// part, this generator's own draw included, so adding that draw back turns "what is spare" into
// "what this generator may burn". A second recipe eating the same fuel — Recycled Rubber, say —
// is therefore handled for free: its share sits in amountRequiredProduction and never reaches the
// allowance. Pre-sink because the AWESOME Sink only ever takes what nothing else claimed, so a
// surplus currently being sunk is still spare fuel, and burning it shrinks the sunk amount by
// itself on the next recalculation.
//
// Null when the question cannot be answered: no fuel to dial, no part ledger yet, or a factory
// with no supply of the fuel at all, where the only honest answer is "bring some in".
export const fuelFixTarget = (
  producer: FactoryPowerProducer,
  factory: Factory,
  gameData: DataInterface
): number | null => {
  const fuelPart = producerFuelPart(producer, gameData)
  if (!fuelPart) {
    return null
  }

  const partData = factory.parts[fuelPart]
  if (!partData || partData.amountSupplied <= 0) {
    return null
  }

  // ?? amountRemaining for plans saved before pre-sink surplus was tracked; the two only differ
  // once a sink is placed, which those plans could not have done either.
  const spare = (producer.ingredients[0]?.perMin ?? 0) +
    (partData.amountRemainingPreSink ?? partData.amountRemaining)

  // Floored at zero: when the factory's other demands already outstrip the supply there is
  // nothing left over, and zero means turn the generator off rather than burn fuel that isn't
  // there. Formatted because the ledger arrives carrying float noise.
  return Math.max(0, formatNumberFully(spare, 3))
}

// Which way the fuel draw would have to move to match supply, or null to offer nothing.
// Named for the action rather than for the sign of the shortfall: a fuel deficit means this
// generator has to burn less, which is the opposite of what a product's deficit asks for.
export const shouldShowFuelFix = (
  producer: FactoryPowerProducer,
  factory: Factory,
  gameData: DataInterface
): 'trim' | 'expand' | null => {
  const target = fuelFixTarget(producer, factory, gameData)
  if (target === null) {
    return null
  }

  const current = producer.ingredients[0]?.perMin ?? 0

  if (target < current) {
    return 'trim'
  }

  if (target > current) {
    return 'expand'
  }

  return null
}

// Sets the fuel rate to fuelFixTarget. The caller must call updateFactory afterwards, as with
// fixProduct — the power, the buildings and the building groups are all derived from it.
export const fixProducerFuel = (
  producer: FactoryPowerProducer,
  factory: Factory,
  gameData: DataInterface
): void => {
  const target = fuelFixTarget(producer, factory, gameData)
  if (target === null) {
    console.error('power: fixProducerFuel: no fuel target could be calculated!', producer)
    return
  }

  producer.fuelAmount = target
  producer.updated = FactoryPowerChangeType.Fuel
}
