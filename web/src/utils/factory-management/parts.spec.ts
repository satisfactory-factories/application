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

      calculateFactories([mockFactory, otherMockFactory], gameData, true) // Part metrics need to be calculated before dependencies
      calculateFactories([mockFactory, otherMockFactory], gameData)

      expect(mockFactory.parts.CompactedCoal.amountSupplied).toBe(50)
      expect(mockFactory.parts.CompactedCoal.amountSuppliedViaInput).toBe(50)
      expect(mockFactory.parts.CompactedCoal.amountSuppliedViaProduction).toBe(0)
      expect(mockFactory.parts.CompactedCoal.amountRemaining).toBe(-30)
      expect(mockFactory.parts.CompactedCoal.satisfied).toBe(false)

      // And on the mock factory that produces the compacted coal
      expect(otherMockFactory.parts.CompactedCoal.amountSupplied).toBe(50)
      expect(otherMockFactory.parts.CompactedCoal.amountSuppliedViaProduction).toBe(50)
      expect(otherMockFactory.parts.CompactedCoal.amountRequired).toBe(0) // It's a product with no demand
      expect(otherMockFactory.parts.CompactedCoal.amountRequiredExports).toBe(0)
      expect(otherMockFactory.parts.CompactedCoal.amountRequiredProduction).toBe(0)
      expect(otherMockFactory.parts.CompactedCoal.amountRemaining).toBe(50)
      expect(otherMockFactory.parts.CompactedCoal.satisfied).toBe(true)
      expect(otherMockFactory.parts.CompactedCoal.exportable).toBe(true)
    })
  })
})
