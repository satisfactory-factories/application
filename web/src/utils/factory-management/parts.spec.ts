import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { getHandGatheredParts, isAmountSatisfied } from '@/utils/factory-management/parts'

describe('parts', () => {
  // The one place the assumption still lives, and it is decided by the game data rather than by
  // a setting. Pinned exactly: game data is versioned and regenerated, and without this a new
  // recipe could silently turn a hand-gathered resource into a mandatory planned input, or turn
  // a mineable one into something the planner quietly supplies for free.
  //
  // Wells count as extractors here. Nitrogen Gas is well-only, and classing it hand-gathered
  // would erase every Nitrogen shortage in every plan.
  describe('hand-gathered resources', () => {
    it('is exactly the resources the game gives no extractor for', () => {
      expect([...getHandGatheredParts(gameData)].sort()).toEqual([
        'Crystal',
        'Crystal_mk2',
        'Crystal_mk3',
        'Gift',
        'HatcherParts',
        'HogParts',
        'Leaves',
        'Mycelia',
        'SpitterParts',
        'StingerParts',
        'Wood',
      ])
    })

    it('does not class a well-only resource as hand-gathered', () => {
      expect(getHandGatheredParts(gameData).has('NitrogenGas')).toBe(false)
    })

    it('memoises per game data object rather than once for the process', () => {
      const other = { ...gameData, items: { ...gameData.items, rawResources: {} } }
      expect(getHandGatheredParts(gameData).size).toBe(11)
      expect(getHandGatheredParts(other).size).toBe(0)
      expect(getHandGatheredParts(gameData).size).toBe(11)
    })
  })

  describe('calculateParts', () => {
    let mockFactory: Factory

    beforeEach(() => {
      mockFactory = newFactory('Test Factory')
      addProductToFactory(mockFactory, {
        id: 'CompactedCoal',
        amount: 50,
        recipe: 'Alternate_EnrichedCoal',
      })
    })

    it('should calculate satisfaction properly for a product with no dependants', () => {
      calculateFactories([mockFactory], gameData)

      expect(mockFactory.parts.CompactedCoal.amountSupplied).toBe(50)
      expect(mockFactory.parts.CompactedCoal.amountSuppliedViaProduction).toBe(50)
      expect(mockFactory.parts.CompactedCoal.amountRemaining).toBe(50)
      expect(mockFactory.parts.CompactedCoal.amountRequiredProduction).toBe(0)
    })

    it('should mark factory as not satisfied if any part production is insufficient', () => {
      // Add a demand to the factory that uses compacted coal
      addProductToFactory(mockFactory, {
        id: 'LiquidTurboFuel',
        amount: 100,
        recipe: 'Alternate_Turbofuel',
      })

      calculateFactories([mockFactory], gameData)
      expect(mockFactory.parts.CompactedCoal.satisfied).toBe(false)
      expect(mockFactory.parts.CompactedCoal.amountRemaining).toBe(-30)
      expect(mockFactory.requirementsSatisfied).toBe(false)
    })

    it('should mark factory as satisfied if there are no products', () => {
      mockFactory.products = []
      calculateFactories([mockFactory], gameData)
      expect(mockFactory.requirementsSatisfied).toBe(true)
    })

    it('should calculate fluid ingredients when there is raw resource fluid ingredient', () => {
      const mockProductWithByProducts = {
        id: 'AluminaSolution',
        amount: 100,
        recipe: 'AluminaSolution',
      }

      addProductToFactory(mockFactory, mockProductWithByProducts)
      calculateFactories([mockFactory], gameData)

      // Expect that all parts involved with creating Alumina have been added, including water.
      // Water has an extractor, so nothing supplies it for free — it is a shortage until the
      // factory pumps it or imports it.
      expect(mockFactory.parts.Water.amountRequired).toBe(150)
      expect(mockFactory.parts.Water.amountSuppliedViaRaw).toBe(0)
      expect(mockFactory.parts.Water.amountSupplied).toBe(0)
      expect(mockFactory.parts.Water.amountRemaining).toBe(-150)
      expect(mockFactory.parts.Water.satisfied).toBe(false)
    })

    it('should calculate metrics properly when a product is used by another product', () => {
      // Add a demand to the factory that uses compacted coal
      addProductToFactory(mockFactory, {
        id: 'LiquidTurboFuel',
        amount: 100,
        recipe: 'Alternate_Turbofuel',
      })

      calculateFactories([mockFactory], gameData)

      expect(mockFactory.parts.CompactedCoal.amountSupplied).toBe(50)
      expect(mockFactory.parts.CompactedCoal.amountSuppliedViaProduction).toBe(50)
      expect(mockFactory.parts.CompactedCoal.amountRemaining).toBe(-30)
      expect(mockFactory.parts.CompactedCoal.amountRequiredProduction).toBe(80)
      expect(mockFactory.parts.CompactedCoal.satisfied).toBe(false)
    })

    it('should calculate metrics properly when an item is imported and it used for internal production', () => {
      const otherMockFactory = newFactory('Factory 1')
      mockFactory.products = []
      addProductToFactory(mockFactory, {
        id: 'LiquidTurboFuel',
        amount: 100,
        recipe: 'Alternate_Turbofuel',
      })
      addProductToFactory(otherMockFactory, {
        id: 'CompactedCoal',
        amount: 50,
        recipe: 'Alternate_EnrichedCoal',
      })
      addInputToFactory(mockFactory, {
        factoryId: otherMockFactory.id,
        outputPart: 'CompactedCoal',
        amount: 50,
      })

      calculateFactories([mockFactory, otherMockFactory], gameData)

      expect(mockFactory.parts.CompactedCoal.amountSupplied).toBe(50)
      expect(mockFactory.parts.CompactedCoal.amountSuppliedViaInput).toBe(50)
      expect(mockFactory.parts.CompactedCoal.amountSuppliedViaProduction).toBe(0)
      expect(mockFactory.parts.CompactedCoal.amountRemaining).toBe(-30)
      expect(mockFactory.parts.CompactedCoal.satisfied).toBe(false)

      // And on the mock factory that produces the compacted coal
      expect(otherMockFactory.parts.CompactedCoal.amountSupplied).toBe(50)
      expect(otherMockFactory.parts.CompactedCoal.amountSuppliedViaProduction).toBe(50)
      expect(otherMockFactory.parts.CompactedCoal.amountRequired).toBe(50) // It's a product with no demand
      expect(otherMockFactory.parts.CompactedCoal.amountRequiredExports).toBe(50)
      expect(otherMockFactory.parts.CompactedCoal.amountRequiredProduction).toBe(0)
      expect(otherMockFactory.parts.CompactedCoal.amountRemaining).toBe(0)
      expect(otherMockFactory.parts.CompactedCoal.satisfied).toBe(true)
      expect(otherMockFactory.parts.CompactedCoal.exportable).toBe(true)
    })
  })

  // https://github.com/satisfactory-factories/application/issues/431
  describe('unpackaged raw resources (issue #431)', () => {
    let mockFactory: Factory

    beforeEach(() => {
      mockFactory = newFactory('Oil Factory')
    })

    it('should not double count a raw resource that is fully supplied by unpackaging', () => {
      // Unpackage Oil produces 60 Crude Oil (LiquidOil) per min
      addProductToFactory(mockFactory, {
        id: 'LiquidOil',
        amount: 60,
        recipe: 'UnpackageOil',
      })
      // Plastic consumes 60 Crude Oil per min at 40 Plastic per min
      addProductToFactory(mockFactory, {
        id: 'Plastic',
        amount: 40,
        recipe: 'Plastic',
      })

      calculateFactories([mockFactory], gameData)

      expect(mockFactory.parts.LiquidOil.amountRequired).toBe(60)
      expect(mockFactory.parts.LiquidOil.amountSuppliedViaProduction).toBe(60)
      // The demand is already met by unpackaging, no raw supply should be assumed
      expect(mockFactory.parts.LiquidOil.amountSuppliedViaRaw).toBe(0)
      expect(mockFactory.parts.LiquidOil.amountSupplied).toBe(60)
      expect(mockFactory.parts.LiquidOil.amountRemaining).toBe(0)
      expect(mockFactory.parts.LiquidOil.satisfied).toBe(true)

      // It also should not be listed as a raw resource requirement
      expect(mockFactory.rawResources.LiquidOil).toBeUndefined()
    })

    it('should top up with raw supply when unpackaging only partially covers demand', () => {
      // Unpackage Oil produces 30 Crude Oil per min
      addProductToFactory(mockFactory, {
        id: 'LiquidOil',
        amount: 30,
        recipe: 'UnpackageOil',
      })
      // Plastic demands 60 Crude Oil per min
      addProductToFactory(mockFactory, {
        id: 'Plastic',
        amount: 40,
        recipe: 'Plastic',
      })

      calculateFactories([mockFactory], gameData)

      expect(mockFactory.parts.LiquidOil.amountRequired).toBe(60)
      expect(mockFactory.parts.LiquidOil.amountSuppliedViaProduction).toBe(30)
      // The half unpackaging doesn't cover is a real shortfall now. This is the exact shape of
      // the bug that killed the assumption: partially covering a raw part used to read as
      // fully satisfied, with the assumed remainder invisible.
      expect(mockFactory.parts.LiquidOil.amountSuppliedViaRaw).toBe(0)
      expect(mockFactory.parts.LiquidOil.amountSupplied).toBe(30)
      expect(mockFactory.parts.LiquidOil.amountRemaining).toBe(-30)
      expect(mockFactory.parts.LiquidOil.satisfied).toBe(false)

      // The raw resources list still shows what the world would have to provide
      expect(mockFactory.rawResources.LiquidOil.amount).toBe(30)
    })

    it('should fully satisfy internal demand via unpackaged imports with no raw import and no surplus', () => {
      // Replicates the faulty plan from the issue:
      // "Packaged Oil" packages raw crude oil, using canisters sent back from "Consumer".
      const packagerFactory = newFactory('Packaged Oil', 0, 9887)
      addProductToFactory(packagerFactory, {
        id: 'PackagedOil',
        amount: 300,
        recipe: 'PackagedCrudeOil',
      })

      // "Consumer" imports the Packaged Oil, unpackages it and refines all of the crude oil.
      const consumerFactory = newFactory('Consumer', 1, 1151)
      addProductToFactory(consumerFactory, {
        id: 'HeavyOilResidue',
        amount: 400,
        recipe: 'Alternate_HeavyOilResidue',
      })
      addProductToFactory(consumerFactory, {
        id: 'LiquidOil',
        amount: 300,
        recipe: 'UnpackageOil',
      })

      addInputToFactory(consumerFactory, {
        factoryId: packagerFactory.id,
        outputPart: 'PackagedOil',
        amount: 300,
      })
      addInputToFactory(packagerFactory, {
        factoryId: consumerFactory.id,
        outputPart: 'FluidCanister',
        amount: 300,
      })

      calculateFactories([packagerFactory, consumerFactory], gameData)

      // The packager needs raw crude oil it doesn't extract, so it is short of it — the world
      // no longer hands it over.
      expect(packagerFactory.parts.LiquidOil.amountSuppliedViaRaw).toBe(0)
      expect(packagerFactory.parts.LiquidOil.satisfied).toBe(false)
      expect(packagerFactory.rawResources.LiquidOil.amount).toBe(300)

      // The consumer's crude oil demand is fully met by unpackaging - no raw import, no surplus
      const liquidOil = consumerFactory.parts.LiquidOil
      expect(liquidOil.amountRequired).toBe(300)
      expect(liquidOil.amountSuppliedViaProduction).toBe(300)
      expect(liquidOil.amountSuppliedViaRaw).toBe(0)
      expect(liquidOil.amountSupplied).toBe(300)
      expect(liquidOil.amountRemaining).toBe(0)
      expect(liquidOil.satisfied).toBe(true)
      expect(consumerFactory.rawResources.LiquidOil).toBeUndefined()
    })

    it('should count excess unpackaged raw resource as surplus once, not twice', () => {
      // Unpackage Oil produces 60 Crude Oil per min with no demand
      addProductToFactory(mockFactory, {
        id: 'LiquidOil',
        amount: 60,
        recipe: 'UnpackageOil',
      })

      calculateFactories([mockFactory], gameData)

      expect(mockFactory.parts.LiquidOil.amountRequired).toBe(0)
      expect(mockFactory.parts.LiquidOil.amountSuppliedViaRaw).toBe(0)
      expect(mockFactory.parts.LiquidOil.amountSupplied).toBe(60)
      expect(mockFactory.parts.LiquidOil.amountRemaining).toBe(60)
      expect(mockFactory.rawResources.LiquidOil).toBeUndefined()
    })
  })

  it('should properly remove part data with no name', () => {
    const mockFactory = newFactory('Test Factory')
    addProductToFactory(mockFactory, {
      id: 'CompactedCoal',
      amount: 50,
      recipe: 'Alternate_EnrichedCoal',
    })

    // @ts-ignore
    mockFactory.parts[''] = {
      amountRequired: 0,
    }

    calculateFactories([mockFactory], gameData)

    expect(mockFactory.parts['']).toBeUndefined()
  })
})

// A group solved against a target expresses its clock in the four decimal places the game allows,
// so on a large line it lands a hair under and stays there. Before this, a sweep of 10,000/min
// on-site mines came out falsely red 33 times in 101 with nothing the user could do about it.
describe('satisfaction tolerance', () => {
  it('ignores a shortfall the clock could not have corrected', () => {
    expect(isAmountSatisfied(-0.009, 10000)).toBe(true)
    expect(isAmountSatisfied(-0.0009, 100)).toBe(true)
  })

  it('still reports a shortage worth acting on', () => {
    expect(isAmountSatisfied(-1, 10000)).toBe(false)
    expect(isAmountSatisfied(-0.5, 100)).toBe(false)
    expect(isAmountSatisfied(-100, 100)).toBe(false)
    // Just outside the tolerance at each scale.
    expect(isAmountSatisfied(-0.02, 10000)).toBe(false)
    expect(isAmountSatisfied(-0.002, 100)).toBe(false)
  })

  it('leaves a surplus and an exact match satisfied', () => {
    expect(isAmountSatisfied(0, 100)).toBe(true)
    expect(isAmountSatisfied(50, 100)).toBe(true)
  })

  it('does not mask a shortage when nothing is required', () => {
    expect(isAmountSatisfied(-5, 0)).toBe(false)
  })

  // The end-to-end case: a factory mining exactly what it smelts, at a scale where the drift bites.
  it('does not turn a self-sufficient mine red at scale', () => {
    const factory = newFactory('Mine and Smelt')
    addProductToFactory(factory, { id: 'IronIngot', amount: 10062.5, recipe: 'IngotIron' })
    addProductToFactory(factory, { id: 'OreIron', amount: 10062.5, recipe: 'Extract_OreIron' })
    Object.assign(factory.products[1].buildingGroups[0], { extractorBuilding: 'minermk3', purity: 'pure' })
    factory.products[1].buildingGroupItemSync = true

    const plan = [factory]
    calculateFactories(plan, gameData)
    factory.products[1].amount = factory.parts.OreIron.amountRequired
    calculateFactories(plan, gameData)
    calculateFactories(plan, gameData, { origin: 'buildingGroup' })

    expect(factory.parts.OreIron.satisfied).toBe(true)
    expect(factory.hasProblem).toBe(false)
  })
})
