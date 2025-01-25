import { beforeEach, describe, expect, it } from 'vitest'

import { useGameDataStore } from '@/stores/game-data-store'

let gameDataStore: ReturnType<typeof useGameDataStore>

describe('game-data-store', () => {
  beforeEach(() => {
    gameDataStore = useGameDataStore()
  })

  it('should return the correct recipe for nuclear waste', () => {
    const result = gameDataStore.getGeneratorFuelRecipeByPart('NuclearWaste')

    if (!result) {
      throw new Error('No PowerRecipe found!')
    }

    expect(result.id).toEqual('GeneratorNuclear_NuclearFuelRod')
    expect(result.displayName).toBe('Nuclear Power Plant (Uranium Fuel Rod)') // Shortened by UI
  })

  it('should return the correct recipe for plutonium waste', () => {
    const result = gameDataStore.getGeneratorFuelRecipeByPart('PlutoniumWaste')

    if (!result) {
      throw new Error('No PowerRecipe found!')
    }

    expect(result.id).toEqual('GeneratorNuclear_PlutoniumFuelRod')
    expect(result.displayName).toBe('Nuclear Power Plant (Plutonium Fuel Rod)')
  })
})
