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
  // The satisfaction panel's "+ Product" and "Add to factory" buttons both build a product from
  // this. Returning '' for a part with several recipes and no obvious winner put an item with no
  // recipe into the plan, and the engine counts such a product's whole output as supplied while
  // asking for no ingredients and no buildings - so the shortage the user clicked simply vanished
  // and the factory read as solved.
  describe('getDefaultRecipeIdForPart', () => {
    // Every part that fell through to '' before: several recipes, none named after the part, and
    // more than one non-alternate among them.
    it.each([
      'AlienProtein',
      'CompactedCoal',
      'CrystalShard',
      'FicsiteIngot',
      'GenericBiomass',
      'HeavyOilResidue',
      'LiquidTurboFuel',
    ])('offers a real recipe for %s', part => {
      const recipe = gameDataStore.getDefaultRecipeForPart(part)

      expect(recipe).not.toBe('')
      expect(gameDataStore.getRecipesForPart(part).map(candidate => candidate.id)).toContain(recipe)
    })

    it('still prefers the recipe named after the part', () => {
      expect(gameDataStore.getDefaultRecipeForPart('IronPlate')).toBe('IronPlate')
    })

    it('still prefers mining a raw resource over converting it', () => {
      expect(gameDataStore.getDefaultRecipeForPart('OreIron')).toBe('Extract_OreIron')
    })

    it('returns nothing only when nothing can make the part', () => {
      expect(gameDataStore.getDefaultRecipeForPart('NotAPartAtAll')).toBe('')
    })
  })
})
