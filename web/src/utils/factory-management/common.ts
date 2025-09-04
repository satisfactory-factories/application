import { Factory, ItemType } from '@/interfaces/planner/FactoryInterface'
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
export const getRecipe = (recipeId: any, gameData: DataInterface): Recipe | undefined => {
  const recipe = gameData.recipes.find(r => r.id === recipeId)

  if (!recipe) {
    console.error(`Recipe with ID ${recipeId} not found.`)
    return
  }

  return recipe
}

export const getPowerRecipe = (id: string, gameData: DataInterface): PowerRecipe | undefined => {
  if (!gameData || !id) {
    return
  }

  const recipeData = gameData.powerGenerationRecipes.find(recipe => recipe.id === id) ?? undefined

  // Create a structured clone of the recipe so no changes are made to the original data
  return JSON.parse(JSON.stringify(recipeData))
}

export const getPartDisplayNameWithoutDataStore = (part: string, gameData: DataInterface): string => {
  if (!part) {
    return 'NO PART!!!'
  }
  if (!gameData) {
    console.error('getPartDisplayName: No game data!!')
    return 'NO DATA!!!'
  }
  return gameData.items.rawResources[part]?.name ||
    gameData.items.parts[part]?.name ||
    `UNKNOWN PART ${part}!`
}

export const getBuildingDisplayName = (building: string) => {
  const buildingFriendly = new Map<string, string>([
    ['assemblermk1', 'Assembler'],
    ['blender', 'Blender'],
    ['constructormk1', 'Constructor'],
    ['converter', 'Converter'],
    ['foundrymk1', 'Foundry'],
    ['hadroncollider', 'Particle Accelerator'],
    ['generatorbiomass', 'Biomass Burner'],
    ['generatorcoal', 'Coal-Powered Generator'],
    ['generatorfuel', 'Fuel-Powered Generator'],
    ['generatornuclear', 'Nuclear Power Plant'],
    ['manufacturermk1', 'Manufacturer'],
    ['oilrefinery', 'Oil Refinery'],
    ['packager', 'Packager'],
    ['quantumencoder', 'Quantum Encoder'],
    ['smeltermk1', 'Smelter'],
    ['waterExtractor', 'Water Extractor'],
  ])

  return buildingFriendly.get(building) ?? `UNKNOWN BUILDING: ${building}`
}

export const deleteItem = (index: number, type: ItemType, factory: Factory) => {
  if (type === ItemType.Product) {
    factory.products.splice(index, 1)

    // We need to loop through each one in order and fix their ordering with the running count
    factory.products.forEach((product, index) => {
      product.displayOrder = index
    })
  } else if (type === ItemType.Power) {
    factory.powerProducers.splice(index, 1)

    // We need to loop through each one in order and fix their ordering with the running count
    factory.powerProducers.forEach((producer, index) => {
      producer.displayOrder = index
    })
  }

  // Must call updateFactory!
}
