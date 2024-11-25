import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory, calculateProducts } from '@/utils/factory-management/products'
import { calculateRawSupply } from '@/utils/factory-management/supply'
import { gameData } from '@/utils/gameData'

describe('supply', () => {
  let mockFactory: Factory

  beforeEach(() => {
    mockFactory = newFactory('Iron Ingots')
  })

  describe('calculateRawSupply', () => {
    it('should calculate fluid supply from raw sources', () => {
      const mockFluidProduct = {
        id: 'AluminaSolution',
        amount: 100,
        recipe: 'AluminaSolution',
      }

      // Reset the mock factory, we want very specific detail here
      mockFactory.products = []
      mockFactory.parts = {}

      addProductToFactory(mockFactory, mockFluidProduct)
      calculateProducts(mockFactory, gameData)
      calculateRawSupply(mockFactory, gameData)

      // Expect that all parts involved with creating Alumina have been added, including water.
      expect(mockFactory.parts.Water.amountRequired).toBe(150)

      // Expect that since Water is a raw resource, it's been marked as supplied.
      expect(mockFactory.parts.Water.amountSuppliedViaInput).toBe(150)
    })
  })
})
