// The raw-input assumption decides whether a factory quietly tops up raw shortfalls or reports
// them as real shortages. It resolves per factory first, then falls back to the user's global
// choice, so both layers are covered here.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { factoryAssumesRawInputs } from '@/utils/factory-management/parts'
import { getAssumeRawInputs, setAssumeRawInputs } from '@/utils/factory-management/settings'
import { showAddProduct, showAddToFactory, showRawShortageChip } from '@/utils/factory-management/satisfaction'
import { calculateAbleToImport } from '@/utils/factory-management/inputs'
import { fetchGameData } from '@/utils/gameDataService'

describe('raw input assumption', async () => {
  const gameData = await fetchGameData()

  let mockFactory: Factory

  // 16 smelters' worth of demand with nothing supplying the ore.
  const buildSmelter = () => {
    const factory = newFactory('Iron Smelter', 0, 1)
    addProductToFactory(factory, { id: 'IronIngot', recipe: 'IngotIron', amount: 480 })
    return factory
  }

  beforeEach(() => {
    setAssumeRawInputs(true)
    mockFactory = buildSmelter()
  })

  afterEach(() => {
    setAssumeRawInputs(true)
  })

  describe('resolution', () => {
    it('inherits the global setting when the factory has no opinion', () => {
      mockFactory.assumeRawInputs = null
      expect(factoryAssumesRawInputs(mockFactory)).toBe(true)

      setAssumeRawInputs(false)
      expect(factoryAssumesRawInputs(mockFactory)).toBe(false)
    })

    it('lets a factory override the global in either direction', () => {
      setAssumeRawInputs(false)
      mockFactory.assumeRawInputs = true
      expect(factoryAssumesRawInputs(mockFactory)).toBe(true)

      setAssumeRawInputs(true)
      mockFactory.assumeRawInputs = false
      expect(factoryAssumesRawInputs(mockFactory)).toBe(false)
    })

    it('treats an absent field as inherit, so old saves are unaffected', () => {
      delete mockFactory.assumeRawInputs
      expect(factoryAssumesRawInputs(mockFactory)).toBe(getAssumeRawInputs())
    })
  })

  describe('with the assumption on', () => {
    beforeEach(() => {
      calculateFactories([mockFactory], gameData)
    })

    it('tops the ore up and reports the factory as satisfied', () => {
      expect(mockFactory.parts.OreIron.amountRequired).toBe(480)
      expect(mockFactory.parts.OreIron.amountSuppliedViaRaw).toBe(480)
      expect(mockFactory.parts.OreIron.satisfied).toBe(true)
      expect(mockFactory.requirementsSatisfied).toBe(true)
      expect(mockFactory.hasProblem).toBe(false)
    })

    it('offers no shortage buttons for the raw part', () => {
      expect(showAddProduct(mockFactory, mockFactory.parts.OreIron, 'OreIron')).toBe(false)
      expect(showAddToFactory(mockFactory, mockFactory.parts.OreIron, 'OreIron')).toBe(false)
      expect(showRawShortageChip(mockFactory, 'OreIron')).toBe(false)
    })
  })

  describe('with the assumption off', () => {
    beforeEach(() => {
      setAssumeRawInputs(false)
      calculateFactories([mockFactory], gameData)
    })

    it('leaves the ore unmet so it lands as a real deficit', () => {
      expect(mockFactory.parts.OreIron.amountSuppliedViaRaw).toBe(0)
      expect(mockFactory.parts.OreIron.amountRemaining).toBe(-480)
      expect(mockFactory.parts.OreIron.satisfied).toBe(false)
      expect(mockFactory.requirementsSatisfied).toBe(false)
      expect(mockFactory.hasProblem).toBe(true)
    })

    it('still records what the world would have to provide', () => {
      expect(mockFactory.rawResources.OreIron.amount).toBe(480)
    })

    it('offers the shortage buttons so the ore can be mined or imported', () => {
      expect(showAddProduct(mockFactory, mockFactory.parts.OreIron, 'OreIron')).toBe(true)
      expect(showAddToFactory(mockFactory, mockFactory.parts.OreIron, 'OreIron')).toBe(true)
      expect(showRawShortageChip(mockFactory, 'OreIron')).toBe(true)
    })

    it('allows a raw-only factory to import, which it could not before', () => {
      const mine = newFactory('Iron Mine', 1, 2)
      addProductToFactory(mine, { id: 'OreIron', recipe: 'Extract_OreIron', amount: 480 })
      calculateFactories([mine, mockFactory], gameData)

      // A factory demanding only raw parts used to be told there was nothing to import.
      expect(calculateAbleToImport(mockFactory, [mine])).toBe(true)

      mockFactory.assumeRawInputs = true
      calculateFactories([mine, mockFactory], gameData)
      expect(calculateAbleToImport(mockFactory, [mine])).toBe('rawOnly')
    })

    it('is satisfied again once the ore is actually extracted on site', () => {
      addProductToFactory(mockFactory, { id: 'OreIron', recipe: 'Extract_OreIron', amount: 480 })
      calculateFactories([mockFactory], gameData)

      expect(mockFactory.parts.OreIron.satisfied).toBe(true)
      expect(mockFactory.requirementsSatisfied).toBe(true)
      expect(mockFactory.rawResources.OreIron).toBeUndefined()
    })
  })
})
