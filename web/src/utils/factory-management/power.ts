import { Factory, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { createNewPart, getPowerRecipeById } from '@/utils/factory-management/common'
import { PowerRecipe } from '@/interfaces/Recipes'
import { formatNumber } from '@/utils/numberFormatter'

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

    // If for some reason the ingredients is missing, replace them with the recipe ingredients as a basis
    if (!producer.ingredients[0]) {
      console.error(`Could not find ingredients for producer: ${producer.recipe}`)
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

    // Now add the ingredients to the parts array
    producer.ingredients.forEach(ingredient => {
      createNewPart(factory, ingredient.part)
      factory.parts[ingredient.part].amountRequiredPower += ingredient.perMin

      // If the part is a raw resource also add it to the rawResources array
      if (gameData.items.rawResources[ingredient.part]) {
        // Mark the part as raw which will eventually be marked as fully satisfied.
        factory.parts[ingredient.part].isRaw = true

        if (!factory.rawResources[ingredient.part]) {
          factory.rawResources[ingredient.part] = {
            id: ingredient.part,
            name: gameData.items.rawResources[ingredient.part].name,
            amount: 0,
          }
        }
        factory.rawResources[ingredient.part].amount += ingredient.perMin
      }
    })

    // Now add the byproducts
    if (recipe.byproduct) {
      createNewPart(factory, recipe.byproduct.part)

      const byProductRatio = recipe.byproduct.perMin / recipe.ingredients[0].perMin
      let amount = byProductRatio * producer.ingredients[0].perMin
      if (isNaN(amount)) {
        amount = 0
      }

      factory.parts[recipe.byproduct.part].amountSuppliedViaProduction += amount

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
