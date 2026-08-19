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

    // #545: a product's amount is read against its recipe's *primary* output, so a recipe that
    // only drops the part as a byproduct cannot be the default. Picking Plastic for Heavy Oil
    // Residue built a row reading "300 Heavy Oil Residue" out of 300 Plastic worth of refineries.
    it.each([
      ['HeavyOilResidue', 'Alternate_HeavyOilResidue'],
      ['PolymerResin', 'Alternate_PolymerResin'],
      ['CompactedCoal', 'Alternate_EnrichedCoal'],
      ['DarkEnergy', 'DarkEnergy'],
    ])('makes %s outright rather than as a byproduct of something else', (part, expected) => {
      expect(gameDataStore.getDefaultRecipeForPart(part)).toBe(expected)
    })

    it('returns nothing for a part that only ever appears as a byproduct', () => {
      expect(gameDataStore.getDefaultRecipeForPart('DissolvedSilica')).toBe('')
    })

    it('never offers a recipe that only drops the part as a byproduct', () => {
      const parts = [
        ...Object.keys(gameDataStore.getGameData().items.parts),
        ...Object.keys(gameDataStore.getGameData().items.rawResources),
      ]

      parts.forEach(part => {
        const recipeId = gameDataStore.getDefaultRecipeForPart(part)
        if (!recipeId) return

        const recipe = gameDataStore.getRecipeById(recipeId)
        expect(recipe?.products.find(product => product.part === part)?.isByProduct).toBe(false)
      })
    })
  })
})
