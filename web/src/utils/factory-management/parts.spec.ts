import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { addInputToFactory } from '@/utils/factory-management/inputs'

describe('parts', () => {
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
      expect(mockFactory.parts.Water.amountRequired).toBe(150)
      expect(mockFactory.parts.Water.amountSupplied).toBe(150)
      expect(mockFactory.parts.Water.amountSuppliedViaRaw).toBe(150)
      expect(mockFactory.parts.Water.amountRemaining).toBe(0)
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
      // Only the shortfall is assumed to be supplied raw
      expect(mockFactory.parts.LiquidOil.amountSuppliedViaRaw).toBe(30)
      expect(mockFactory.parts.LiquidOil.amountSupplied).toBe(60)
      expect(mockFactory.parts.LiquidOil.amountRemaining).toBe(0)
      expect(mockFactory.parts.LiquidOil.satisfied).toBe(true)

      // The raw resources list should only show the shortfall
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

      // The packager genuinely draws raw crude oil from the world
      expect(packagerFactory.parts.LiquidOil.amountSuppliedViaRaw).toBe(300)
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
