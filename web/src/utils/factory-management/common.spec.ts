import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { canPartBeProducedDirectly, createNewPart, generateFactoryItemId, getPrimaryProductRecipes } from '@/utils/factory-management/common'
import { gameData } from '@/utils/gameData'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'

describe('common', () => {
  let mockFactory: Factory

  beforeEach(() => {
    mockFactory = newFactory('Test Factory')
    addProductToFactory(mockFactory, {
      id: 'CompactedCoal',
      amount: 1234,
      recipe: 'CompactedCoal',
    })
  })

  describe('createNewPart', () => {
    test('should create a new part', () => {
      const part = 'NewPart'

      createNewPart(mockFactory, part)

      expect(mockFactory.parts[part]).toBeDefined()
    })

    test('should not overwrite existing parts', () => {
      const part = 'CompactedCoal'

      createNewPart(mockFactory, part)
      mockFactory.parts[part].amountRequired = 1234

      createNewPart(mockFactory, part)

      // If it was to make a new one it would be initialized as 0.
      expect(mockFactory.parts[part].amountRequired).toBe(1234)
    })
  })

  // #546: these ids key the game-sync snapshots and the element ids on the card, so a duplicate
  // makes the factory permanently unsyncable. The taken set spans both collections.
  describe('generateFactoryItemId', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    // 0.5 -> "5000", 0.6 -> "6000". Feeding the same draw twice is the collision.
    const drawSequence = (...values: number[]) => {
      const queue = [...values]
      vi.spyOn(Math, 'random').mockImplementation(() => queue.shift() ?? 0.9)
    }

    test('should not reissue an id a power producer already holds', () => {
      mockFactory.powerProducers = [{ id: '5000' } as any]
      drawSequence(0.5, 0.6)

      expect(generateFactoryItemId(mockFactory)).toBe('6000')
    })

    test('should not reissue an id a custom building already holds', () => {
      mockFactory.customBuildings = [{ id: '5000' } as any]
      drawSequence(0.5, 0.6)

      expect(generateFactoryItemId(mockFactory)).toBe('6000')
    })

    test('should issue an untaken id straight away', () => {
      mockFactory.powerProducers = [{ id: '5000' } as any]
      drawSequence(0.6)

      expect(generateFactoryItemId(mockFactory)).toBe('6000')
    })

    test('should widen the id range when every draw collides', () => {
      mockFactory.powerProducers = [{ id: '5000' } as any]
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      // 50 collisions later the range grows tenfold, so the same draw lands somewhere new.
      expect(generateFactoryItemId(mockFactory)).toBe('50000')
    })
  })

  describe('getPrimaryProductRecipes', () => {
    test('should omit recipes that only drop the part as a byproduct', () => {
      const recipeIds = getPrimaryProductRecipes('HeavyOilResidue', gameData).map(recipe => recipe.id)

      expect(recipeIds).toContain('Alternate_HeavyOilResidue')
      // Plastic makes Heavy Oil Residue on the side, it does not make it.
      expect(recipeIds).not.toContain('Plastic')
    })

    test('should return nothing for a part no recipe makes', () => {
      expect(getPrimaryProductRecipes('NotAPartAtAll', gameData)).toEqual([])
    })
  })

  describe('canPartBeProducedDirectly', () => {
    test.each([
      'SteelPlate',
      'HeavyOilResidue',
      // #545: a Converter makes Dark Matter Residue outright, even though every Quantum
      // Encoder recipe also drops it as a byproduct.
      'DarkEnergy',
      // Raws are "made" by their extraction recipe.
      'OreIron',
    ])('should be true for %s', part => {
      expect(canPartBeProducedDirectly(part, gameData)).toBe(true)
    })

    test.each([
      // Falls out of Quartz Purification and nothing else.
      'DissolvedSilica',
      // Power generation byproducts, which have no item recipe at all.
      'NuclearWaste',
      'PlutoniumWaste',
      'NotAPartAtAll',
    ])('should be false for %s', part => {
      expect(canPartBeProducedDirectly(part, gameData)).toBe(false)
    })
  })
})
