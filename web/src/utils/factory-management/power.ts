import { Factory, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { getPowerRecipeById } from '@/utils/factory-management/common'
import { PowerRecipe } from '@/interfaces/Recipes'
import { formatNumber } from '@/utils/numberFormatter'

// For internal testing use
export const addPowerProducerToFactory = (
  factory: Factory,
  options: {
    building?: string,
    buildingAmount?: number,
    powerAmount?: number,
    ingredientAmount?: number,
    recipe: string;
    updated: string // Supply one of 'power', 'ingredient', 'building', needed so the power generation can be recalculated.
  },
) => {
  factory.powerProducers.push({
    building: options.building ?? '',
    buildingAmount: options.buildingAmount ?? 0,
    buildingCount: 0, // Calculated later
    ingredients: [], // Calculated later
    ingredientAmount: options.ingredientAmount ?? 0,
    powerAmount: options.powerAmount ?? 0,
    powerProduced: 0, // Calculated later
    recipe: options.recipe,
    byproduct: null,
    displayOrder: factory.powerProducers.length,
    updated: options.updated,
  })
}

// Depending on which value is updated, we need to recalculate the power generation.
export const calculatePowerProducers = (
  factory: Factory,
  gameData: DataInterface
) => {
  factory.powerProducers.forEach(producer => {
    const originalRecipe = getPowerRecipeById(producer.recipe, gameData) // Shallow copy the recipe data every time
    if (!originalRecipe) {
      console.error(`Could not find recipe with id: ${producer.recipe}`)
      return
    }

    const recipe = structuredClone(toRaw(originalRecipe))

    // Upon initialization or re-selection, the ingredients array is empty, so we need to set it to the recipe ingredients.
    if (!producer.ingredients[0]) {
      producer.ingredients = recipe.ingredients
    }

    if (producer.updated === 'power') {
      producer.powerProduced = producer.powerAmount // Simply replace it

      // Now we need to calculate the amount of items produced per minute
      producer.ingredientAmount = producer.powerProduced / (recipe.ingredients[0].mwPerItem ?? 0)
      producer.ingredients[0].perMin = producer.ingredientAmount
    }

    if (producer.updated === 'ingredient') {
      producer.ingredients[0].perMin = producer.ingredientAmount // Replace the ingredient directly

      // Now we've handled the updated values, we can calculate the power generation again
      producer.powerProduced = calculatePowerAmount(producer, recipe)
      producer.powerAmount = Number(formatNumber(producer.powerProduced))
    }

    if (producer.updated === 'building') {
      producer.buildingCount = producer.buildingAmount // Replace the building directly

      // Now we need to set the ingredients in a ratio equivalent of the amount of buildings
      producer.ingredients[0].perMin = recipe.ingredients[0].perMin * producer.buildingCount
      producer.ingredientAmount = producer.ingredients[0].perMin

      // Now we need to increase the power so the supplemental fuel is calculated correctly
      producer.powerProduced = calculatePowerAmount(producer, recipe)
      producer.powerAmount = Number(formatNumber(producer.powerProduced))
    }

    // For supplemental fuels, we need to know the power produced in order to calculate them
    if (producer.ingredients[1]) {
      producer.ingredients[1].perMin = producer.powerProduced * (recipe.ingredients[1].supplementalRatio ?? 0)
    }

    if (producer.updated !== 'building') {
      // Now calculate the amount of buildings the user needs to build
      producer.buildingCount = producer.powerProduced / recipe.building.power
      producer.buildingAmount = Number(formatNumber(producer.buildingCount))
    }

    // Now add the byproducts
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
  })
}

export const calculatePowerAmount = (
  producer: FactoryPowerProducer,
  recipe: PowerRecipe,
): number => {
  // Simply take the mwPerItem and multiply by the amount of items produced per minute
  const mwPerItem = recipe.ingredients[0].mwPerItem ?? 0
  const amount = producer.ingredientAmount
  return mwPerItem * amount
}
