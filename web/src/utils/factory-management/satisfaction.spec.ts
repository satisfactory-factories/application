import { beforeEach, describe, expect, it, test } from 'vitest'
import { calculateFactorySatisfaction } from './satisfaction'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory, calculateProducts } from '@/utils/factory-management/products'
import { calculateRawSupply } from '@/utils/factory-management/supply'
import { gameData } from '@/utils/gameData'

describe('satisfaction', () => {
  describe('calculateFactorySatisfaction', () => {
    let mockFactory: Factory

    beforeEach(() => {
      mockFactory = newFactory('Test Factory')
      addProductToFactory(mockFactory, {
        id: 'CompactedCoal',
        amount: 1234,
        recipe: 'CompactedCoal',
      })
    })

    test('should mark factory as satisfied if all parts are satisfied', () => {
      mockFactory.parts.CompactedCoal.satisfied = true
      calculateFactorySatisfaction(mockFactory)
      expect(mockFactory.requirementsSatisfied).toBe(true)
    })

    test('should mark factory as not satisfied if any part is not satisfied', () => {
      mockFactory.parts.CompactedCoal = {
        ...mockFactory.parts.CompactedCoal,
        amountRequired: 100,
        amountSuppliedViaInput: 50,
      }
      calculateFactorySatisfaction(mockFactory)
      expect(mockFactory.parts.CompactedCoal.satisfied).toBe(false)
      expect(mockFactory.requirementsSatisfied).toBe(false)
    })

    test('should mark factory as satisfied if there are no products', () => {
      mockFactory.products = []
      calculateFactorySatisfaction(mockFactory)
      expect(mockFactory.requirementsSatisfied).toBe(true)
    })

    it('should calculate fluid ingredients when there is raw resource fluid ingredient', () => {
      const mockProductWithByProducts = {
        id: 'AluminaSolution',
        amount: 100,
        recipe: 'AluminaSolution',
      }

      // Reset the mock factory, we want very specific detail here
      mockFactory.products = []
      mockFactory.parts = {}

      addProductToFactory(mockFactory, mockProductWithByProducts)
      calculateProducts(mockFactory, gameData)
      calculateRawSupply(mockFactory, gameData)
      calculateFactorySatisfaction(mockFactory)

      // Expect that all parts involved with creating Alumina have been added, including water.
      expect(mockFactory.parts.Water.amountRequired).toBe(150)
      expect(mockFactory.parts.Water.amountSuppliedViaInput).toBe(150)
      expect(mockFactory.parts.Water.amountRemaining).toBe(0)
    })
  })
})
