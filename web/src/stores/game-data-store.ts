import { defineStore } from 'pinia'
import { ref } from 'vue'
import { CustomBuilding, DataInterface } from '@/interfaces/DataInterface'
import { config } from '@/config/config'
import { PowerRecipe, Recipe } from '@/interfaces/Recipes'
import { loadLocalGameData } from './local-game-data-loader'
import { getPrimaryProductRecipes } from '@/utils/factory-management/common'
import { recordEvent } from '@/utils/record-event'

export const useGameDataStore = defineStore('game-data', () => {
  const localData = loadLocalGameData()
  const gameData = ref<DataInterface | null>(localData.gameData)
  const localDataVersion = ref<string | null>(localData.version)

  const dataVersion: string = config.dataVersion ?? ''

  if (!dataVersion) {
    throw new Error('No data version found in config!')
  }

  const loadGameData = async (): Promise<void> => {
    try {
      if (localDataVersion.value !== dataVersion || !gameData.value) {
        console.log('Game data not detected or outdated, loading it.')
        const response = await fetch(`/gameData_v${dataVersion}.json`)
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`)
        }
        const fetchedData: DataInterface = await response.json()

        if (!fetchedData) {
          throw new Error('No data received!')
        }

        gameData.value = fetchedData
        localStorage.setItem('localDataVersion', dataVersion)
        localStorage.setItem('gameData', JSON.stringify(gameData.value))
      } else {
        console.log(`Game data V${dataVersion} detected, skipping load.`)
      }
    } catch (err) {
      console.error('Error loading game data:', err)
      gameData.value = null
    }
  }

  const getGameData = (): DataInterface => {
    if (!gameData.value) {
      loadGameData()
    }

    if (!gameData.value) {
      alert('Could not load the game data! Please report this on Discord!')
      recordEvent('game_data_load_failed')
      throw new Error('Game data not loaded even after attempting to re-load it!')
    }
    return gameData.value
  }

  const getRecipeById = (id: string): Recipe | null => {
    if (!gameData.value || !id) {
      return null
    }

    return gameData.value.recipes.find(recipe => recipe.id === id) ?? null
  }

  const getPowerRecipeById = (id: string): PowerRecipe | null => {
    if (!gameData.value || !id) {
      return null
    }

    return gameData.value.powerGenerationRecipes.find(recipe => recipe.id === id) ?? null
  }

  const getRecipesForPart = (part: string) => {
    if (!gameData.value || !part) {
      return []
    }

    return gameData.value.recipes.filter(recipe => {
      // Filter the recipe product array to return only the recipes that produce the part
      return recipe.products.filter(product => product.part === part).length > 0
    })
  }

  // Only the recipes that make the part outright, i.e. not the ones that merely drop it as a
  // byproduct. Anything building a *product* from a part wants this list rather than the one
  // above; see getPrimaryProductRecipes for why.
  const getPrimaryRecipesForPart = (part: string): Recipe[] => {
    if (!gameData.value || !part) {
      return []
    }

    return getPrimaryProductRecipes(part, gameData.value)
  }

  const getRecipesForPowerProducer = (building: string): PowerRecipe[] | [] => {
    if (!gameData.value || !building) {
      console.error('getRecipesForPowerProducer: No game data or building provided!')
      return []
    }

    return gameData.value.powerGenerationRecipes.filter(recipe => {
      // Filter the recipe product array to return only the recipes that produce the part
      return recipe.building.name === building
    })
  }

  const getDefaultRecipeIdForPart = (part: string) => {
    // Primary recipes only. A product's amount is always read against its recipe's first product,
    // so handing back a recipe that only drops the part on the side (Plastic, for Heavy Oil
    // Residue) makes the number the user typed mean an amount of something else - the row reads
    // "300 Heavy Oil Residue" while the factory builds 300 Plastic worth of refineries.
    const recipes = getPrimaryRecipesForPart(part)
    if (recipes.length === 1) {
      return recipes[0].id
    }

    // Raw resources are extracted far more often than they are synthesised, and several have a
    // Converter recipe too (Iron Ore from Limestone), which would otherwise leave the selector
    // empty. Picking a raw resource means mining it unless the user says otherwise.
    if (gameData.value?.items.rawResources[part]) {
      // Prefer a plain extractor: a resource well needs its satellite nodes describing before
      // it produces anything, so it is a poor default to land someone on.
      const extractionRecipe = recipes.find(recipe => recipe.extraction && !recipe.extraction.well) ??
        recipes.find(recipe => recipe.extraction)
      if (extractionRecipe) {
        return extractionRecipe.id
      }
    }

    // Power Shard's other recipes (PowerCrystalShard_1/2/3) consume Power Slugs - a one-off world
    // pickup with no extractor, not a renewable ingredient - so the generic "first non-alternate"
    // rule below would default someone building steady-state production onto a recipe they can
    // never sustain. Synthetic Power Shard is the only recipe built from ordinary, minable
    // ingredients, so it is the sane default whenever it exists.
    // https://github.com/satisfactory-factories/application/issues/594
    if (part === 'CrystalShard') {
      const synthetic = recipes.find(recipe => recipe.id === 'SyntheticPowerShard')
      if (synthetic) {
        return synthetic.id
      }
    }

    const exactRecipe = recipes.find(recipe => recipe.id === part)
    if (exactRecipe) {
      return exactRecipe.id
    }

    // Any real recipe beats none. Falling through to '' put a product with no recipe into the
    // plan: addProductToFactory took it, and the engine then counted its full output as supplied
    // with no ingredients and no buildings - so clicking "+ Product" on a shortage made that
    // shortage vanish out of thin air, and the factory read as solved. Seven parts reached it:
    // Alien Protein, Compacted Coal, Power Shard, Ficsite Ingot, Biomass, Heavy Oil Residue and
    // Turbofuel, each of them having several recipes with no obvious winner among them. Power
    // Shard's case is handled above now; the rest still fall through to this generic rule.
    //
    // A non-alternate is the least surprising guess, and the selector is right there for anyone
    // who meant a different one. '' now means only what it says: nothing can make this part.
    //
    // Unpackaging is never a way of *making* something - the packaged form has to come from the
    // unpackaged one first - so it is the last thing to land on, ahead only of nothing at all.
    const isUnpackaging = (recipe: Recipe) => recipe.id.startsWith('Unpackage')
    const madeRecipes = recipes.filter(recipe => !isUnpackaging(recipe))
    const defaultRecipes = madeRecipes.filter(recipe => !recipe.isAlternate)
    return defaultRecipes[0]?.id ?? madeRecipes[0]?.id ?? recipes[0]?.id ?? ''
  }

  const getDefaultRecipeForPowerProducer = (building: string): PowerRecipe => {
    const recipes = getRecipesForPowerProducer(building)

    if (!recipes || recipes.length === 0) {
      console.error(`No recipes found for power producer ${building}`)
    }

    // There is no current means to determine the default recipe, so just return the first one for now.

    return recipes[0]
  }

  const getGeneratorFuelRecipeByPart = (part: string): PowerRecipe | null => {
    if (!gameData.value || !part) {
      return null
    }

    // Filter the recipes by byproduct and return the matching ones
    const recipes = gameData.value.powerGenerationRecipes.filter(recipe => {
      return recipe.byproduct?.part === part
    })

    if (recipes.length === 0) {
      return null
    }

    return recipes[0]
  }

  // Buildings that make nothing but still cost power (portals, stations, lights), for the
  // Custom Buildings section. Sorted by the parser, so the order here is the order shown.
  const getCustomBuildings = (): CustomBuilding[] => {
    return gameData.value?.customBuildings ?? []
  }

  const getCustomBuildingByName = (name: string): CustomBuilding | null => {
    if (!name) {
      return null
    }

    return getCustomBuildings().find(building => building.name === name) ?? null
  }

  return {
    gameData,
    getGameData,
    getCustomBuildings,
    getCustomBuildingByName,
    loadGameData,
    getRecipeById,
    getPowerRecipeById,
    getRecipesForPart,
    getPrimaryRecipesForPart,
    getRecipesForPowerProducer,
    getDefaultRecipeForPart: getDefaultRecipeIdForPart,
    getDefaultRecipeForPowerProducer,
    getGeneratorFuelRecipeByPart,
  }
})
