import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DataInterface } from '@/interfaces/DataInterface'
import { config } from '@/config/config'
import { PowerRecipe, Recipe } from '@/interfaces/Recipes'
import { loadLocalGameData } from './local-game-data-loader'

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

  const getDefaultRecipeForPart = (part: string) => {
    const recipes = getRecipesForPart(part)
    if (recipes.length === 1) {
      return recipes[0].id
    }

    const exactRecipe = recipes.find(recipe => recipe.id === part)
    if (exactRecipe) {
      return exactRecipe.id
    } else {
      const defaultRecipes = recipes.filter(recipe => !recipe.isAlternate)
      if (defaultRecipes.length === 1) {
        return defaultRecipes[0].id
      }
    }

    return ''
  }

  const getDefaultRecipeForPowerProducer = (building: string): PowerRecipe => {
    const recipes = getRecipesForPowerProducer(building)

    if (!recipes || recipes.length === 0) {
      console.error(`No recipes found for power producer ${building}`)
    }

    // There is no current means to determine the default recipe, so just return the first one for now.

    return recipes[0]
  }

  return {
    gameData,
    getGameData,
    loadGameData,
    getRecipeById,
    getPowerRecipeById,
    getRecipesForPart,
    getRecipesForPowerProducer,
    getDefaultRecipeForPart,
    getDefaultRecipeForPowerProducer,
  }
})
