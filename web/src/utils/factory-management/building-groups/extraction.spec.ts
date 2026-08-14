// Extraction is the one place where three per-group multipliers stack: the extractor mark, the
// node purity and the overclock. The figures asserted here are taken from the Satisfactory wiki
// rather than derived from our own code, so a regression in any one of the three shows up as a
// number the game would disagree with.

import { beforeEach, describe, expect, it } from 'vitest'
import { BuildingGroup, Factory, FactoryItem, ItemType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import {
  getExtractionOutputMultiplier,
  getExtractionRecipeForPart,
  getGroupExtractionRate,
  getGroupExtractor,
  getGroupPurity,
  isExtractionRecipe,
  isPlainExtraction,
  isWellRecipe,
  PURITY_MULTIPLIERS,
  sanitizeGroupExtraction,
} from '@/utils/factory-management/building-groups/extraction'
import { calculateProductBuildingGroupPower } from '@/utils/factory-management/building-groups/common'
import { fetchGameData } from '@/utils/gameDataService'

describe('extraction', async () => {
  const gameData = await fetchGameData()

  const group = (overrides: Partial<BuildingGroup> = {}): BuildingGroup => ({
    id: 1,
    type: ItemType.Product,
    buildingCount: 1,
    overclockPercent: 100,
    somersloops: 0,
    parts: {},
    powerUsage: 0,
    powerProduced: 0,
    ...overrides,
  })

  describe('recipe detection', () => {
    it('identifies extraction recipes and leaves everything else alone', () => {
      expect(isExtractionRecipe('Extract_RawQuartz')).toBe(true)
      expect(isExtractionRecipe('Extract_Water')).toBe(true)
      expect(isExtractionRecipe('IngotIron')).toBe(false)
      expect(isExtractionRecipe('')).toBe(false)
      expect(isExtractionRecipe(undefined)).toBe(false)
    })

    it('returns a multiplier of 1 for non-extraction recipes so nothing else changes', () => {
      expect(getExtractionOutputMultiplier(group(), 'IngotIron')).toBe(1)
      expect(getExtractionOutputMultiplier(group(), undefined)).toBe(1)
    })

    it('finds the extraction recipe for a resource that has one', () => {
      expect(getExtractionRecipeForPart('OreIron')).toBe('Extract_OreIron')
      expect(getExtractionRecipeForPart('Water')).toBe('Extract_Water')
      expect(getExtractionRecipeForPart('LiquidOil')).toBe('Extract_LiquidOil')
    })

    it('has no extraction recipe for collectables', () => {
      // These drive whether the Raw Resources card offers a "mine it here" button.
      expect(getExtractionRecipeForPart('Leaves')).toBeUndefined()
      expect(getExtractionRecipeForPart('HogParts')).toBeUndefined()
      expect(getExtractionRecipeForPart('Crystal')).toBeUndefined()
      expect(getExtractionRecipeForPart('IronIngot')).toBeUndefined()
    })
  })

  describe('defaults and sanitizing', () => {
    it('defaults a group to the reference extractor on a normal node', () => {
      const subject = group()
      sanitizeGroupExtraction(subject, 'Extract_RawQuartz')

      expect(subject.extractorBuilding).toBe('minermk1')
      expect(subject.purity).toBe('normal')
    })

    it('falls back when the group holds an extractor or purity the recipe does not offer', () => {
      const subject = group({ extractorBuilding: 'smeltermk1', purity: 'pure' })
      sanitizeGroupExtraction(subject, 'Extract_Water')

      expect(subject.extractorBuilding).toBe('waterpump')
      // Water has no purity, so a saved "pure" must not survive and inflate the output.
      expect(subject.purity).toBe('normal')
      expect(getExtractionOutputMultiplier(subject, 'Extract_Water')).toBe(1)
    })

    it('leaves non-extraction groups untouched', () => {
      const subject = group()
      sanitizeGroupExtraction(subject, 'IngotIron')

      expect(subject.extractorBuilding).toBeUndefined()
      expect(subject.purity).toBeUndefined()
    })

    it('resolves the extractor and purity without mutating', () => {
      const subject = group({ extractorBuilding: 'minermk3', purity: 'pure' })

      expect(getGroupExtractor(subject, 'Extract_OreIron')).toBe('minermk3')
      expect(getGroupPurity(subject, 'Extract_OreIron')).toBe('pure')
    })
  })

  // Nobody builds Mk.1 miners, so the first thing done to a new mine is swapping the default
  // mark — which must not silently rewrite the quantity the user typed.
  describe('mines default to unsynced building groups', () => {
    let mockFactory: Factory

    beforeEach(() => {
      mockFactory = newFactory('Iron Mine')
    })

    it('starts an extraction product with building group sync off', () => {
      addProductToFactory(mockFactory, { id: 'OreIron', recipe: 'Extract_OreIron', amount: 480 })

      expect(mockFactory.products[0].buildingGroupItemSync).toBe(false)
    })

    it('still solves the initial group before turning sync off', () => {
      addProductToFactory(mockFactory, { id: 'OreIron', recipe: 'Extract_OreIron', amount: 480 })
      const [firstGroup] = mockFactory.products[0].buildingGroups

      // 480/min on Mk.1 normal nodes is 8 whole miners, not a fractional count.
      expect(firstGroup.buildingCount).toBe(8)
      expect(firstGroup.overclockPercent).toBe(100)
    })

    it('leaves the quantity alone when the miner mark is swapped', () => {
      addProductToFactory(mockFactory, { id: 'OreIron', recipe: 'Extract_OreIron', amount: 480 })
      calculateFactories([mockFactory], gameData)

      mockFactory.products[0].buildingGroups[0].extractorBuilding = 'minermk3'
      calculateFactories([mockFactory], gameData, { origin: 'buildingGroup' })

      expect(mockFactory.products[0].amount).toBe(480)
      // The groups now out-produce the target, which is surfaced rather than silently applied.
      expect(mockFactory.products[0].buildingGroupsHaveProblem).toBe(true)
    })

    it('keeps sync on for ordinary products', () => {
      addProductToFactory(mockFactory, { id: 'IronIngot', recipe: 'IngotIron', amount: 480 })

      expect(mockFactory.products[0].buildingGroupItemSync).toBe(true)
    })

    // A Water Extractor has one mark and no purity, so its groups never need to differ — the
    // reason mines start unsynced does not apply to it.
    it('keeps sync on for water, which is plain extraction', () => {
      addProductToFactory(mockFactory, { id: 'Water', recipe: 'Extract_Water', amount: 480 })

      expect(mockFactory.products[0].buildingGroupItemSync).toBe(true)
    })
  })

  describe('plain extraction', () => {
    it('is water, and only water', () => {
      expect(isPlainExtraction('Extract_Water')).toBe(true)
    })

    it('is not a mine, which spans three marks and three purities', () => {
      expect(isPlainExtraction('Extract_OreIron')).toBe(false)
      // One extractor, but purity still changes what it yields.
      expect(isPlainExtraction('Extract_LiquidOil')).toBe(false)
    })

    it('is not a well, whose output comes from its satellites', () => {
      expect(isPlainExtraction('Extract_Water_Well')).toBe(false)
    })

    it('is not anything that does not extract at all', () => {
      expect(isPlainExtraction('IngotIron')).toBe(false)
      expect(isPlainExtraction(undefined)).toBe(false)
    })
  })

  // Wiki: Miner Mk.1 30/60/120, Mk.2 60/120/240, Mk.3 120/240/480 per minute.
  describe('mark x purity rates', () => {
    const cases: [string, keyof typeof PURITY_MULTIPLIERS, number][] = [
      ['minermk1', 'impure', 30],
      ['minermk1', 'normal', 60],
      ['minermk1', 'pure', 120],
      ['minermk2', 'impure', 60],
      ['minermk2', 'normal', 120],
      ['minermk2', 'pure', 240],
      ['minermk3', 'impure', 120],
      ['minermk3', 'normal', 240],
      ['minermk3', 'pure', 480],
    ]

    it.each(cases)('%s on a %s node extracts %i/min', (extractorBuilding, purity, expected) => {
      const subject = group({ extractorBuilding, purity })

      expect(getGroupExtractionRate(subject, 'Extract_RawQuartz')).toBe(expected)
      // The reference rate is Mk.1 at normal (60), so the multiplier is the rate over that.
      expect(getExtractionOutputMultiplier(subject, 'Extract_RawQuartz')).toBe(expected / 60)
    })

    it('extracts oil at 60/120/240 by purity', () => {
      const rates = (['impure', 'normal', 'pure'] as const).map(purity =>
        getGroupExtractionRate(group({ extractorBuilding: 'oilpump', purity }), 'Extract_LiquidOil')
      )

      expect(rates).toEqual([60, 120, 240])
    })

    it('extracts water at a flat 120/min regardless of the purity asked for', () => {
      const rates = (['impure', 'normal', 'pure'] as const).map(purity =>
        getGroupExtractionRate(group({ extractorBuilding: 'waterpump', purity }), 'Extract_Water')
      )

      expect(rates).toEqual([120, 120, 120])
    })
  })

  // The heart of it: a Miner Mk.2 on a pure Raw Quartz node, overclocked. Rate scales linearly
  // with the clock; power follows the game's clock^1.321928 curve and ignores purity entirely.
  describe('overclocking on top of mark and purity', () => {
    let mockFactory: Factory
    let product: FactoryItem

    const setClock = (overclockPercent: number) => {
      // Mines default to unsynced (see the defaults block below); these cases are about the
      // group's output reaching the item, so opt back in.
      product.buildingGroupItemSync = true
      const subject = product.buildingGroups[0]
      subject.extractorBuilding = 'minermk2'
      subject.purity = 'pure'
      subject.buildingCount = 1
      subject.overclockPercent = overclockPercent
      subject.clockSetByUser = true
    }

    const recalculate = () =>
      calculateFactories([mockFactory], gameData, { origin: 'buildingGroup' })

    beforeEach(() => {
      mockFactory = newFactory('Quartz Mine')
      addProductToFactory(mockFactory, { id: 'RawQuartz', recipe: 'Extract_RawQuartz' })
      product = mockFactory.products[0]
    })

    it('produces 240/min at 15 MW on a pure node at 100%', () => {
      setClock(100)
      recalculate()

      expect(product.amount).toBe(240)
      expect(mockFactory.power.consumed).toBe(15)
    })

    it('produces 600/min at 50.4 MW at 250%', () => {
      setClock(250)
      recalculate()

      expect(product.amount).toBe(600)
      // 15 x 2.5^1.321928 = 50.37
      expect(mockFactory.power.consumed).toBeCloseTo(50.4, 1)
    })

    it('produces 560/min at 46 MW at 233.3333%', () => {
      setClock(233.3333)
      recalculate()

      expect(product.amount).toBeCloseTo(560, 2)
      // 15 x 2.333333^1.321928 = 45.98
      expect(mockFactory.power.consumed).toBeCloseTo(46, 0)
      // A user-dialled fractional clock is deliberate precision and must not be snapped away.
      expect(product.buildingGroups[0].overclockPercent).toBe(233.3333)
    })

    it('scales the rate linearly with the clock but not the power', () => {
      setClock(100)
      recalculate()
      const baseRate = product.amount
      const basePower = mockFactory.power.consumed

      setClock(200)
      recalculate()

      expect(product.amount).toBe(baseRate * 2)
      // Power is superlinear: 15 x 2^1.321928 = 37.5, not 30.
      expect(mockFactory.power.consumed).toBeGreaterThan(basePower * 2)
      expect(mockFactory.power.consumed).toBeCloseTo(37.5, 1)
    })

    it('does not change power when only the purity changes', () => {
      setClock(100)
      product.buildingGroups[0].purity = 'impure'
      recalculate()
      const impurePower = mockFactory.power.consumed
      const impureRate = product.amount

      product.buildingGroups[0].purity = 'pure'
      recalculate()

      expect(product.amount).toBe(impureRate * 4)
      expect(mockFactory.power.consumed).toBe(impurePower)
    })

    it('draws power from each group\'s own extractor, not the product\'s', () => {
      const groups = [
        group({ id: 1, extractorBuilding: 'minermk3', purity: 'pure', buildingCount: 2 }),
        group({ id: 2, extractorBuilding: 'minermk2', purity: 'normal', buildingCount: 1 }),
      ]

      calculateProductBuildingGroupPower(groups, 'minermk1', 'Extract_RawQuartz')

      expect(groups[0].powerUsage).toBe(90) // 2 x Mk.3 @ 45 MW
      expect(groups[1].powerUsage).toBe(15) // 1 x Mk.2 @ 15 MW
    })
  })

  // A well is a powered pressurizer driving unpowered satellite extractors, each on its own
  // micro-node. Figures below are from a real 780 m3/min well: 1 normal + 6 pure satellites.
  describe('resource wells', () => {
    let mockFactory: Factory
    let product: FactoryItem

    const buildWell = (satellites: { impure: number, normal: number, pure: number }, clock = 100) => {
      mockFactory = newFactory('Water Well')
      addProductToFactory(mockFactory, { id: 'Water', recipe: 'Extract_Water_Well', amount: 60 })
      product = mockFactory.products[0]
      product.buildingGroupItemSync = true

      const group = product.buildingGroups[0]
      group.buildingCount = 1
      group.satellites = satellites
      group.overclockPercent = clock

      calculateFactories([mockFactory], gameData, { origin: 'buildingGroup' })
    }

    it('is recognised as a well, and a plain extractor is not', () => {
      expect(isWellRecipe('Extract_Water_Well')).toBe(true)
      expect(isWellRecipe('Extract_Water')).toBe(false)
      expect(isWellRecipe('IngotIron')).toBe(false)
    })

    it('sums its satellites: 1 normal + 6 pure = 780/min at 150 MW', () => {
      buildWell({ impure: 0, normal: 1, pure: 6 })

      expect(product.amount).toBe(780)
      expect(mockFactory.power.consumed).toBe(150)
    })

    it('scales every satellite with the pressurizer clock', () => {
      buildWell({ impure: 0, normal: 1, pure: 6 }, 250)

      expect(product.amount).toBe(1950)
      // The pressurizer follows the usual curve: 150 x 2.5^1.321928 = 503.66
      expect(mockFactory.power.consumed).toBeCloseTo(503.7, 1)
    })

    it('counts the pressurizer and every satellite extractor as buildings', () => {
      buildWell({ impure: 0, normal: 1, pure: 6 })

      expect(mockFactory.buildingRequirements.frackingsmasher.amount).toBe(1)
      expect(mockFactory.buildingRequirements.frackingextractor.amount).toBe(7)
      // Satellites are unpowered; the pressurizer pays for all of them.
      expect(mockFactory.buildingRequirements.frackingextractor.powerConsumed).toBe(0)
    })

    it('rates satellites at 30 / 60 / 120 by purity', () => {
      buildWell({ impure: 1, normal: 0, pure: 0 })
      expect(product.amount).toBe(30)

      buildWell({ impure: 0, normal: 1, pure: 0 })
      expect(product.amount).toBe(60)

      buildWell({ impure: 0, normal: 0, pure: 1 })
      expect(product.amount).toBe(120)
    })

    it('starts a new well on a single normal satellite rather than nothing', () => {
      const factory = newFactory('Nitrogen Well')
      addProductToFactory(factory, { id: 'NitrogenGas', recipe: 'Extract_NitrogenGas_Well' })
      calculateFactories([factory], gameData)

      expect(factory.products[0].buildingGroups[0].satellites).toEqual({ impure: 0, normal: 1, pure: 0 })
    })

    it('does not leave satellite data on a non-well group', () => {
      const factory = newFactory('Quartz Mine')
      addProductToFactory(factory, { id: 'RawQuartz', recipe: 'Extract_RawQuartz' })
      factory.products[0].buildingGroups[0].satellites = { impure: 1, normal: 1, pure: 1 }
      calculateFactories([factory], gameData)

      expect(factory.products[0].buildingGroups[0].satellites).toBeUndefined()
    })

    it('offers the plain extractor, not the well, for a one-click mine-it-here', () => {
      expect(getExtractionRecipeForPart('Water')).toBe('Extract_Water')
      expect(getExtractionRecipeForPart('LiquidOil')).toBe('Extract_LiquidOil')
    })

    // Solving a target rate against a fresh well group multiplies the pressurizer, since the
    // group starts on one normal satellite — ten 150 MW pressurizers for 600 m³/min of Nitrogen
    // Gas, which looks solved and is an order of magnitude out. Wells get placed by hand.
    it('offers nothing at all for a part only a resource well can extract', () => {
      expect(getExtractionRecipeForPart('NitrogenGas')).toBeUndefined()
    })
  })

  describe('mixed groups on one product', () => {
    it('sums groups of different marks and purities into the product total', () => {
      const mockFactory = newFactory('Quartz Mine')
      addProductToFactory(mockFactory, { id: 'RawQuartz', recipe: 'Extract_RawQuartz' })
      const product = mockFactory.products[0]

      // 2 x Mk.3 pure = 960/min, 1 x Mk.2 normal = 120/min
      product.buildingGroups = [
        group({ id: 1, extractorBuilding: 'minermk3', purity: 'pure', buildingCount: 2 }),
        group({ id: 2, extractorBuilding: 'minermk2', purity: 'normal', buildingCount: 1 }),
      ]
      product.buildingGroupItemSync = true // Asserting the groups' total reaches the item

      calculateFactories([mockFactory], gameData, { origin: 'buildingGroup' })

      expect(product.amount).toBe(1080)
      expect(mockFactory.power.consumed).toBe(105) // 2 x 45 + 15
      expect(mockFactory.buildingRequirements.minermk3.amount).toBe(2)
      expect(mockFactory.buildingRequirements.minermk2.amount).toBe(1)
    })
  })
  // A well makes nothing without satellites, so no building count meets a target. Dividing by the
  // zero multiplier wrote Infinity into buildingCount, and JSON.stringify stores Infinity as null,
  // so the corrupted count survived a save and a reload.
  describe('a well with every satellite set to zero', () => {
    it('never writes a non-finite building count into the plan', () => {
      const factory = newFactory('Nitrogen')
      addProductToFactory(factory, { id: 'NitrogenGas', amount: 240, recipe: 'Extract_NitrogenGas_Well' })
      const product = factory.products[0]
      product.buildingGroupItemSync = true
      product.buildingGroups.forEach(group => {
        group.satellites = { impure: 0, normal: 0, pure: 0 }
      })

      const plan = [factory]
      expect(() => calculateFactories(plan, gameData)).not.toThrow()

      product.buildingGroups.forEach(group => {
        expect(Number.isFinite(group.buildingCount)).toBe(true)
        expect(Number.isFinite(group.overclockPercent)).toBe(true)
      })
      // Infinity is what JSON turns into null, so prove the round trip is clean too.
      expect(JSON.stringify(factory)).not.toContain('null,"overclockPercent"')
      expect(JSON.parse(JSON.stringify(product)).buildingGroups.every(
        (group: { buildingCount: number }) => typeof group.buildingCount === 'number'
      )).toBe(true)
    })
  })
})
