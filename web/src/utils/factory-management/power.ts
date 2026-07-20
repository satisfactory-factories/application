import { Factory, FactoryPowerChangeType, FactoryPowerProducer, ItemType } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { getPowerRecipe } from '@/utils/factory-management/common'
import { PowerRecipe } from '@/interfaces/Recipes'
import { formatNumberFully } from '@/utils/numberFormatter'
import { addBuildingGroup } from '@/utils/factory-management/building-groups/common'

// For internal testing use
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
    id: Math.floor(Math.random() * 10000).toString(),
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

    // Ensure values are correctly formatted
    producer.buildingAmount = formatNumberFully(producer.buildingAmount)
    producer.buildingCount = formatNumberFully(producer.buildingCount)
    producer.powerAmount = formatNumberFully(producer.powerAmount, 1)
    producer.fuelAmount = formatNumberFully(producer.fuelAmount)
    producer.powerProduced = formatNumberFully(producer.powerProduced)
    producer.ingredients.forEach(ingredient => {
      ingredient.perMin = formatNumberFully(ingredient.perMin)
    })
    if (producer.byproduct) {
      producer.byproduct.amount = formatNumberFully(producer.byproduct.amount)
    }

    // Ensure the amounts match the new reality, so that if they are re-calculated they don't change without the user's say so.
    producer.buildingAmount = producer.buildingCount
    producer.powerAmount = producer.powerProduced
    // Re-format after the raw division, otherwise floating point noise leaks back in
    // (e.g. 250 / 33.333… = 7.499999999999999 instead of 7.5).
    producer.fuelAmount = formatNumberFully(producer.powerProduced / (recipe.ingredients[0].mwPerItem ?? 0))
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
