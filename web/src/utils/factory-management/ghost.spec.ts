import { describe, expect, it } from 'vitest'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addProductToFactory } from '@/utils/factory-management/products'
import {
  countedFactories,
  ghostAgeLabel,
  ghostDays,
  ghostFactories,
  isGhost,
  setGhost,
  staleGhosts,
} from '@/utils/factory-management/ghost'
import { calculateGhostPower, calculateTotalPower, calculateTotalRawResources } from '@/utils/statistics'
import { ghostReminderMessage } from '@/composables/useGhostReminder'
import { gameData } from '@/utils/gameData'

const NOW = new Date('2026-11-03T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

describe('ghost factories', () => {
  describe('setGhost', () => {
    it('stores the date it was made a ghost, and deletes the field when brought back', () => {
      const factory = newFactory('Smelter')
      expect(isGhost(factory)).toBe(false)
      expect('ghostSince' in factory).toBe(false)

      setGhost(factory, true, NOW)
      expect(isGhost(factory)).toBe(true)
      expect(factory.ghostSince).toBe(NOW.toISOString())

      setGhost(factory, false)
      expect(isGhost(factory)).toBe(false)
      expect('ghostSince' in factory).toBe(false)
    })

    it('keeps the original date when made a ghost again', () => {
      const factory = newFactory('Smelter')
      setGhost(factory, true, daysAgo(20))
      setGhost(factory, true, NOW)
      expect(factory.ghostSince).toBe(daysAgo(20).toISOString())
    })
  })

  describe('age', () => {
    it('counts whole days and labels them', () => {
      const factory = newFactory('Smelter')
      setGhost(factory, true, daysAgo(0))
      expect(ghostAgeLabel(factory, NOW)).toBe('today')

      factory.ghostSince = daysAgo(1).toISOString()
      expect(ghostAgeLabel(factory, NOW)).toBe('1 day')

      factory.ghostSince = daysAgo(9).toISOString()
      expect(ghostDays(factory, NOW)).toBe(9)
      expect(ghostAgeLabel(factory, NOW)).toBe('9 days')

      factory.ghostSince = daysAgo(22).toISOString()
      expect(ghostAgeLabel(factory, NOW)).toBe('3 weeks')

      factory.ghostSince = daysAgo(95).toISOString()
      expect(ghostAgeLabel(factory, NOW)).toBe('3 months')
    })

    it('reads an unparseable date as today rather than throwing', () => {
      const factory = newFactory('Smelter')
      factory.ghostSince = 'not a date'
      expect(isGhost(factory)).toBe(true)
      expect(ghostDays(factory, NOW)).toBe(0)
    })

    it('lists only ghosts out for 14 days or more as stale', () => {
      const fresh = newFactory('Fresh')
      const old = newFactory('Old')
      const built = newFactory('Built')
      setGhost(fresh, true, daysAgo(13))
      setGhost(old, true, daysAgo(14))
      expect(staleGhosts([fresh, old, built], NOW)).toEqual([old])
    })
  })

  describe('filters', () => {
    it('splits a plan into counted factories and ghosts', () => {
      const built = newFactory('Built')
      const ghost = newFactory('Ghost')
      setGhost(ghost, true)
      expect(countedFactories([built, ghost])).toEqual([built])
      expect(ghostFactories([built, ghost])).toEqual([ghost])
    })
  })

  describe('plan totals', () => {
    const coalPlant = (name: string, mw: number): Factory => {
      const factory = newFactory(name)
      addPowerProducerToFactory(factory, {
        building: 'generatorcoal',
        powerAmount: mw,
        recipe: 'GeneratorCoal_Coal',
        updated: FactoryPowerChangeType.Power,
      })
      return factory
    }

    const augmenters = (name: string, count: number): Factory => {
      const factory = newFactory(name)
      addPowerProducerToFactory(factory, {
        building: 'alienpoweraugmenter',
        buildingAmount: count,
        recipe: 'AlienPowerAugmenter',
        updated: FactoryPowerChangeType.Building,
      })
      return factory
    }

    it('leaves a ghost out of the plan power and out of the grid boost base', () => {
      const boost = augmenters('Augmenters', 1) // 500 MW static, +10% of the grid
      const plant = coalPlant('Coal', 750)
      const ghostPlant = coalPlant('Ghost coal', 1500)
      setGhost(ghostPlant, true)

      const factories = [boost, plant, ghostPlant]
      calculateFactories(factories, gameData)

      // Grid base without the ghost: 500 + 750 = 1250, so the boost is 125.
      expect(boost.power.boostMw).toBe(125)

      const totals = calculateTotalPower(countedFactories(factories))
      expect(totals.totalBasePower).toBe(1250)
      expect(totals.totalPowerProduced).toBe(1375)
    })

    it('says what the grid would look like if every ghost were built', () => {
      const boost = augmenters('Augmenters', 1)
      const plant = coalPlant('Coal', 750)
      const ghostPlant = coalPlant('Ghost coal', 1500)
      setGhost(ghostPlant, true)

      const factories = [boost, plant, ghostPlant]
      calculateFactories(factories, gameData)

      const ghostPower = calculateGhostPower(factories)
      expect(ghostPower.ghosts.map(entry => entry.factory.name)).toEqual(['Ghost coal'])
      expect(ghostPower.produced).toBe(1500)

      // Built, the base is 500 + 750 + 1500 = 2750 and the 10% boost works on all of it.
      expect(ghostPower.ifBuilt.basePower).toBe(2750)
      expect(ghostPower.ifBuilt.boost).toBeCloseTo(275)
      expect(ghostPower.ifBuilt.produced).toBeCloseTo(3025)
    })

    it('counts a ghost\'s own augmenters only in the if-built figures', () => {
      const plant = coalPlant('Coal', 750)
      const ghostBoost = augmenters('Ghost augmenters', 1)
      setGhost(ghostBoost, true)

      const factories = [plant, ghostBoost]
      calculateFactories(factories, gameData)

      const counted = calculateTotalPower(countedFactories(factories))
      expect(counted.totalPowerBoost).toBe(0)
      expect(counted.totalPowerProduced).toBe(750)

      const { ifBuilt } = calculateGhostPower(factories)
      // 750 + 500 base, and the ghost's 10% on top of both.
      expect(ifBuilt.produced).toBeCloseTo(1375)
    })

    it('leaves a ghost\'s raw resources out of the plan totals', () => {
      const mine = newFactory('Mine')
      addProductToFactory(mine, { id: 'OreIron', amount: 30, recipe: 'Extract_OreIron' })
      const ghostMine = newFactory('Ghost mine')
      addProductToFactory(ghostMine, { id: 'OreIron', amount: 300, recipe: 'Extract_OreIron' })
      setGhost(ghostMine, true)

      const factories = [mine, ghostMine]
      calculateFactories(factories, gameData)

      const ore = (list: Factory[]) =>
        calculateTotalRawResources(list).find(entry => entry.id === 'OreIron')?.totalAmount ?? 0
      expect(ore(factories)).toBe(330)
      expect(ore(countedFactories(factories))).toBe(30)
    })
  })

  describe('load reminder', () => {
    it('says nothing until a ghost has been out for 14 days', () => {
      const ghost = newFactory('Smelter')
      setGhost(ghost, true, daysAgo(10))
      expect(ghostReminderMessage([ghost], NOW)).toBeNull()
    })

    it('names a single stale ghost and how long it has been out', () => {
      const ghost = newFactory('Big Iron Smelter')
      setGhost(ghost, true, daysAgo(21))
      expect(ghostReminderMessage([ghost], NOW)).toContain('"Big Iron Smelter"')
      expect(ghostReminderMessage([ghost], NOW)).toContain('3 weeks')
    })

    it('counts several stale ghosts', () => {
      const one = newFactory('One')
      const two = newFactory('Two')
      setGhost(one, true, daysAgo(30))
      setGhost(two, true, daysAgo(15))
      expect(ghostReminderMessage([one, two], NOW)).toMatch(/^2 ghost factories/)
    })
  })
})
