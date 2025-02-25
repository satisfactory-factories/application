import { Factory, FactoryPowerChangeType, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { getPowerRecipe } from '@/utils/factory-management/common'
import { PowerRecipe } from '@/interfaces/Recipes'
import { formatNumberFully } from '@/utils/numberFormatter'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'

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
  })

  if (options.building) {
    // Add the default building group for the producer when one is selected, otherwise we have to wait for the user to choose one
    addPowerProducerBuildingGroup(factory.powerProducers[factory.powerProducers.length - 1], factory, true)
  }
}

// Depending on which value is updated, we need to recalculate the power generation.
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

    if (producer.updated === FactoryPowerChangeType.Power) {
      producer.powerProduced = producer.powerAmount // Simply replace it

      // Now we need to calculate the amount of items produced per minute
      producer.fuelAmount = producer.powerProduced / (recipe.ingredients[0].mwPerItem ?? 0)

      producer.ingredients[0].perMin = producer.fuelAmount
    }

    if (producer.updated === FactoryPowerChangeType.Fuel) {
      producer.ingredients[0].perMin = producer.fuelAmount // Replace the ingredient directly

      // Now we've handled the updated values, we can calculate the power generation again
      producer.powerProduced = calculatePowerAmount(producer, recipe)
      producer.powerAmount = producer.powerProduced
    }

    if (producer.updated === FactoryPowerChangeType.Ingredient) {
      // producer.ingredients[1].perMin will have been changed directly, so we just run the calculation.
      producer.powerProduced = calculatePowerAmount(producer, recipe)
      producer.powerAmount = producer.powerProduced
    }

    if (producer.updated === FactoryPowerChangeType.Building) {
      producer.buildingCount = producer.buildingAmount // Replace the building directly

      // Now we need to set the ingredients in a ratio equivalent of the amount of buildings
      producer.ingredients[0].perMin = recipe.ingredients[0].perMin * producer.buildingCount
      producer.fuelAmount = producer.ingredients[0].perMin

      // Now we need to increase the power so the supplemental fuel is calculated correctly
      producer.powerProduced = calculatePowerAmount(producer, recipe)
      producer.powerAmount = producer.powerProduced
    }

    // For supplemental fuels, we need to know the power produced in order to calculate them
    if (producer.ingredients[1]) {
      producer.ingredients[1].perMin = producer.powerProduced * (recipe.ingredients[1].supplementalRatio ?? 0)
    }

    if (producer.updated !== FactoryPowerChangeType.Building) {
      // Now calculate the amount of buildings the user needs to build
      producer.buildingCount = producer.powerProduced / recipe.building.power
      producer.buildingAmount = producer.buildingCount
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
  })
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
