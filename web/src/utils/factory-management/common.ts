import { Factory } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { PowerRecipe, Recipe } from '@/interfaces/Recipes'

export const createNewPart = (factory: Factory, part: string) => {
  if (!factory.parts[part]) {
    factory.parts[part] = {
      amountRequired: 0,
      amountRequiredExports: 0,
      amountRequiredProduction: 0,
      amountRequiredPower: 0,
      amountSupplied: 0,
      amountSuppliedViaInput: 0,
      amountSuppliedViaRaw: 0,
      amountSuppliedViaProduction: 0,
      amountRemaining: 0,
      satisfied: true,
      isRaw: false,
      exportable: false,
    }
  }
}

// You may think that this is duplication with the gameDataStore. It kind of is, however, trying to mock the store in tests is a gigantic pain in the arse.
// Therefore, usage of gameDataStore within the ./factory-management files is to be used sparingly, and proxies created here.
export const getRecipe = (partId: any, gameData: DataInterface): Recipe | undefined => {
  const recipe = gameData.recipes.find(r => r.id === partId)

  if (!recipe) {
    console.error(`Recipe with ID ${partId} not found.`)
    return
  }

  return recipe
}

export const getPowerRecipeById = (id: string, gameData: DataInterface): PowerRecipe | null => {
  if (!gameData || !id) {
    return null
  }

  return gameData.powerGenerationRecipes.find(recipe => recipe.id === id) ?? null
}
