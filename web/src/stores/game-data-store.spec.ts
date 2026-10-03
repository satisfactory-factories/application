import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DataInterface } from '@/interfaces/DataInterface'
import { createPinia, setActivePinia } from 'pinia'
import { useGameDataStore } from '@/stores/game-data-store'
import * as localGameDataLoader from '@/stores/local-game-data-loader'

let gameDataStore: ReturnType<typeof useGameDataStore>

describe('game-data-store', () => {
  beforeEach(() => {
    gameDataStore = useGameDataStore()
  })

  // The router runs loadGameData before every navigation. It used to compare against the
  // version read at boot and never updated it, so a session that had to download the data
  // (a first visit, or the first after a version bump) downloaded it again on every route
  // change and swapped in a fresh object, re-rendering every component that reads it.
  describe('loadGameData', () => {
    let fetchMock: ReturnType<typeof vi.fn>
    let original: DataInterface

    beforeEach(() => {
      original = gameDataStore.getGameData()
      // A fresh store over an empty localStorage: the case that downloads.
      vi.spyOn(localGameDataLoader, 'loadLocalGameData').mockReturnValueOnce({ gameData: null, version: null })
      setActivePinia(createPinia())
      gameDataStore = useGameDataStore()
      const json = JSON.stringify(original)
      fetchMock = vi.fn(async () => ({ ok: true, json: async () => JSON.parse(json) }))
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('downloads the data once per session, not once per navigation', async () => {
      await gameDataStore.loadGameData()
      const loaded = gameDataStore.gameData

      await gameDataStore.loadGameData()
      await gameDataStore.loadGameData()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(gameDataStore.gameData).toBe(loaded)
    })

    it('keeps the downloaded data when the browser refuses to cache it', async () => {
      const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      })

      try {
        await gameDataStore.loadGameData()
      } finally {
        setItem.mockRestore()
      }

      expect(gameDataStore.gameData).not.toBeNull()
      expect(gameDataStore.getRecipeById('IronPlate')).not.toBeNull()
    })
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

    // https://github.com/satisfactory-factories/application/issues/594 — the other three Power
    // Shard recipes consume Power Slugs, a one-off world pickup with no extractor. Defaulting
    // there suggests an automatable choice that isn't one, so Synthetic Power Shard (built from
    // ordinary, minable ingredients) wins even though it isn't named after the part and isn't the
    // first non-alternate recipe in the list.
    it('prefers Synthetic Power Shard for Power Shard over the Power Slug recipes', () => {
      expect(gameDataStore.getDefaultRecipeForPart('CrystalShard')).toBe('SyntheticPowerShard')
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
