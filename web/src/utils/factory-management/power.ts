import { Factory, FactoryPowerChangeType, FactoryPowerProducer, GroupType } from '@/interfaces/planner/FactoryInterface'
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
    buildingCount: 0, // Calculated later
    ingredients: [], // Calculated later
    fuelAmount: options.fuelAmount ?? 0,
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
      GroupType.Power,
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
    producer.fuelAmount = producer.powerProduced / (recipe.ingredients[0].mwPerItem ?? 0)
  })
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
