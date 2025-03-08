import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import {
  addProductToFactory,
  byProductAsProductCheck,
  fixProduct,
  getProduct, getProductAmountByPart,
  isPartByProductOfRecipe,
  recipeByproductPerMin,
  recipeIngredientPerMin,
  shouldShowFix,
  shouldShowInternal,
  shouldShowNotInDemand,
  updateProductAmountViaByproduct,
  updateProductAmountViaRequirement,
} from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { calculatePartMetrics } from '@/utils/factory-management/parts'
import { create321Scenario } from '@/utils/factory-setups/321-product-byproduct-trimming'
import { create341Scenario } from '@/utils/factory-setups/341-fissible-uranium-issues'
import eventBus from '@/utils/eventBus'
import { getRecipe } from '@/utils/factory-management/common'

vi.mock('@/utils/eventBus', () => ({
  default: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}))

const mockIngotIron = {
  id: 'IronIngot',
  amount: 123,
  recipe: 'IngotIron',
}
const mockIngotCopper = {
  id: 'CopperIngot',
  amount: 123,
  recipe: 'IngotCopper',
}

describe('products', () => {
  let mockFactory: Factory

  beforeEach(() => {
    mockFactory = newFactory('Iron Ingots')
    addProductToFactory(mockFactory, mockIngotIron)
    calculateFactories([mockFactory], gameData)
  })

  describe('addProductToFactory', () => {
    it('should add a product to a factory', () => {
      expect(mockFactory.products.length).toBe(1)
      expect(mockFactory.products[0].id).toBe('IronIngot')
    })
    it('should add a product of different recipe to the factory', () => {
      const mockProductAlt = {
        id: 'IronIngot',
        amount: 123,
        recipe: 'Alternate_IngotIron',
      }
      addProductToFactory(mockFactory, mockProductAlt)

      expect(mockFactory.products.length).toBe(2)
      expect(mockFactory.products[1].id).toBe('IronIngot')
    })
    it('should add a part to the factory', () => {
      expect(mockFactory.parts.IronIngot).toBeDefined()
    })
    it('should add proper display orders', () => {
      addProductToFactory(mockFactory, mockIngotIron)
      addProductToFactory(mockFactory, mockIngotCopper)

      expect(mockFactory.products[0].displayOrder).toBe(0)
      expect(mockFactory.products[1].displayOrder).toBe(1)
    })
  })

  describe('calculateProducts', () => {
    beforeEach(() => {
      mockFactory.products = []
      mockFactory.parts = {}
    })
    afterEach(() => {
      vi.resetAllMocks()
    })
    it('should calculate the products and produce the correct part info', () => {
      addProductToFactory(mockFactory, mockIngotIron)
      addProductToFactory(mockFactory, mockIngotCopper)
      calculateFactories([mockFactory], gameData)

      // Expect the parts to exist
      expect(mockFactory.parts.IronIngot).toBeDefined()
      expect(mockFactory.parts.CopperIngot).toBeDefined()

      // Expect the parts to have the correct amount of surplus data
      expect(mockFactory.parts.IronIngot.amountSuppliedViaProduction).toBe(123)
      expect(mockFactory.parts.IronIngot.amountSupplied).toBe(123)
      expect(mockFactory.parts.IronIngot.amountRemaining).toBe(123)
      expect(mockFactory.parts.IronIngot.satisfied).toBe(true)
      expect(mockFactory.power.consumed).toBe(32.382) // 4.1x iron ingot smelters + 4.1x copper ingot smelters

      // Expect the raw resources to exist
      expect(mockFactory.rawResources.OreIron).toBeDefined()
      expect(mockFactory.rawResources.OreCopper).toBeDefined()
      expect(mockFactory.parts.OreIron).toBeDefined()
      expect(mockFactory.parts.OreCopper).toBeDefined()
      // Expect the raw resources to have the correct amounts
      expect(Number(mockFactory.rawResources.OreIron.amount.toFixed(3))).toBe(123)
      expect(Number(mockFactory.rawResources.OreCopper.amount.toFixed(3))).toBe(123)

      // Expect the rawResource data to be correct
      expect(mockFactory.rawResources.OreIron.name).toBe('Iron Ore')
      expect(mockFactory.parts.OreIron.isRaw).toBe(true)

      // Expect the product to have the correct amount of requirement data
      expect(Number(mockFactory.products[0].requirements.OreIron.amount.toFixed(3))).toBe(123)
    })

    it('should properly calculate part requirements when the recipe returns more than 1 part itself', () => {
      const mockProduct = {
        id: 'CircuitBoard',
        amount: 98,
        recipe: 'Alternate_CircuitBoard_2',
      }

      addProductToFactory(mockFactory, mockProduct)
      calculateFactories([mockFactory], gameData)

      expect(mockFactory.parts.CircuitBoard.amountSupplied).toBe(98)
      expect(mockFactory.parts.HighSpeedWire.amountRequired).toBe(420) // Nice
      expect(mockFactory.parts.Plastic.amountRequired).toBe(140)
    })
    it('should properly calculate part requirements when the recipe returns more than 1 part itself along with rounding', () => {
      const mockProduct = {
        id: 'CircuitBoard',
        amount: 100,
        recipe: 'Alternate_CircuitBoard_2',
      }

      addProductToFactory(mockFactory, mockProduct)
      calculateFactories([mockFactory], gameData)

      expect(mockFactory.parts.CircuitBoard.amountSupplied).toBe(100)
      expect(Number(mockFactory.parts.HighSpeedWire.amountRequired.toFixed(3))).toBe(428.571)
      expect(Number(mockFactory.parts.Plastic.amountRequired.toFixed(3))).toBe(142.857)
    })
    it('should properly calculate metrics when two products require the same ingredient', () => {
      const mockProductIronPlate = {
        id: 'IronPlate',
        amount: 100,
        recipe: 'IronPlate',
      }
      const mockProductIronRod = {
        id: 'IronRod',
        amount: 100,
        recipe: 'IronRod',
      }
      mockIngotIron.amount = 100

      // Reset the mock factory, we want very specific detail here
      mockFactory.products = []
      mockFactory.parts = {}

      // Add the product that's being used
      addProductToFactory(mockFactory, mockIngotIron)

      // Add the products being made
      addProductToFactory(mockFactory, mockProductIronPlate)
      addProductToFactory(mockFactory, mockProductIronRod)

      calculateFactories([mockFactory], gameData)

      // Expect the ingredient requirements to be correct
      // Iron Plate ratio is 3:2 so 150 iron ingots are required
      // Iron Rod ratio is 1:1 so 100 iron ingots are required
      // Totalling 250 Iron Ingots
      expect(mockFactory.parts.IronIngot.amountRequired).toBe(250)

      // Expect the calculation to be correct
      // Producing 100 iron ingots
      expect(mockFactory.parts.IronIngot.amountSupplied).toBe(100)
      // Therefore we expect a deficit of 150 iron ingots
      expect(mockFactory.parts.IronIngot.amountRemaining).toBe(-150)
      // Thus should not be satisfied
      expect(mockFactory.parts.IronIngot.satisfied).toBe(false)
    })

    it('should properly calculate metrics when two same products are using different recipes', () => {
      const mockProduct1 = {
        id: 'IronPlate',
        amount: 100,
        recipe: 'IronPlate',
      }
      const mockProduct2 = {
        id: 'IronPlate',
        amount: 100,
        recipe: 'Alternate_CoatedIronPlate',
      }

      // Add the products that's being used
      addProductToFactory(mockFactory, mockProduct1)
      addProductToFactory(mockFactory, mockProduct2)

      calculateFactories([mockFactory], gameData)

      // This should result in 200 iron plates being made.
      expect(mockFactory.parts.IronPlate.amountSupplied).toBe(200)
      expect(mockFactory.parts.IronPlate.amountSuppliedViaProduction).toBe(200)
      expect(mockFactory.parts.IronPlate.amountRemaining).toBe(200) // Should be 200 left as there's no demand
      expect(mockFactory.parts.IronPlate.amountSuppliedViaInput).toBe(0)
    })
    it('should properly calculate metrics when products are duplicated using same recipe', () => {
      const mockProduct1 = {
        id: 'IronPlate',
        amount: 100,
        recipe: 'IronPlate',
      }
      const mockProduct2 = {
        id: 'IronPlate',
        amount: 200,
        recipe: 'IronPlate',
      }
      // Add the products that's being used
      addProductToFactory(mockFactory, mockProduct1)
      addProductToFactory(mockFactory, mockProduct2)

      calculateFactories([mockFactory], gameData)

      // This should result in 300 iron plates being made.
      expect(mockFactory.parts.IronPlate.amountSupplied).toBe(300)
      expect(mockFactory.parts.IronPlate.amountSuppliedViaProduction).toBe(300)
      expect(mockFactory.parts.IronPlate.amountRemaining).toBe(300) // No demands, 300 left
      expect(mockFactory.parts.IronPlate.amountSuppliedViaInput).toBe(0)
    })
    it('should properly calculate metrics when products are duplicated 3 times using different recipes', () => {
      const mockProduct1 = {
        id: 'IronPlate',
        amount: 50,
        recipe: 'IronPlate',
      }
      const mockProduct2 = {
        id: 'IronPlate',
        amount: 50,
        recipe: 'Alternate_CoatedIronPlate',
      }
      const mockProduct3 = {
        id: 'IronPlate',
        amount: 50,
        recipe: 'Alternate_CoatedIronPlate',
      }
      // Add the products that's being used
      addProductToFactory(mockFactory, mockProduct1)
      addProductToFactory(mockFactory, mockProduct2)
      addProductToFactory(mockFactory, mockProduct3)

      calculateFactories([mockFactory], gameData)

      // This should result in 150 iron plates being made.
      expect(mockFactory.parts.IronPlate.amountSupplied).toBe(150)
      expect(mockFactory.parts.IronPlate.amountSuppliedViaProduction).toBe(150)
      expect(mockFactory.parts.IronPlate.amountRemaining).toBe(150) // No demands, 150 left
      expect(mockFactory.parts.IronPlate.amountSuppliedViaInput).toBe(0)
    })

    it('should properly handle product amounts set to 0', () => {
      const mockProduct = {
        id: 'IronPlate',
        amount: 0,
        recipe: 'IronPlate',
      }

      vi.spyOn(eventBus, 'emit')
      addProductToFactory(mockFactory, mockProduct)
      calculateFactories([mockFactory], gameData)

      expect(eventBus.emit).toHaveBeenCalledWith('toast', {
        message: 'You cannot set a product quantity to be <=0. Setting to 1 to prevent calculation errors. <br>If you need to enter 0.x of numbers, enter a period then the number e.g. ".5".',
        type: 'warning',
      })

      expect(mockFactory.parts.IronPlate.amountSupplied).toBe(1)
      expect(mockFactory.parts.IronPlate.amountRemaining).toBe(1)
      expect(mockFactory.parts.IronIngot.amountRequired).toBe(1.5)
    })
  })

  describe('calculateByProducts', () => {
    beforeEach(() => {
      mockFactory.name = 'Fuel'
    })
    it('should do nothing if the recipe contains no byproducts', () => {
      const mockProductWithoutByProducts = {
        id: 'IronIngot',
        amount: 100,
        recipe: 'IngotIron',
      }

      addProductToFactory(mockFactory, mockProductWithoutByProducts)
      calculateFactories([mockFactory], gameData)

      expect(mockFactory.products[0].byProducts).toHaveLength(0)
    })
    it('should calculate byproducts', () => {
      mockFactory.products = []
      const mockProductWithByProducts = {
        id: 'LiquidFuel',
        amount: 100,
        recipe: 'LiquidFuel',
      }

      addProductToFactory(mockFactory, mockProductWithByProducts)
      calculateFactories([mockFactory], gameData)

      expect(mockFactory.products[0].id).toBe('LiquidFuel')
      expect(mockFactory.products[0].byProducts).toHaveLength(1)
      // @ts-ignore
      expect(mockFactory.products[0].byProducts[0].id).toBe('PolymerResin')

      // Expect that the ByProduct exists in the factory.byProducts array
      expect(mockFactory.byProducts[0].id).toBe('PolymerResin')

      // Expect that the byproduct has been added to the parts array for potential consumption by other products.
      expect(mockFactory.parts.PolymerResin.amountSupplied).toBe(75)
    })
  })

  describe('shouldShowInternal', () => {
    it('should return false if part could not be found', () => {
      mockFactory.parts = {}
      expect(shouldShowInternal(mockFactory.products[0], mockFactory)).toBe(false)
    })
    it('should show when the product is used internally', () => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 100,
        recipe: 'IngotIron',
      })
      addProductToFactory(mockFactory, {
        id: 'IronPlate',
        amount: 100,
        recipe: 'IronPlate',
      })
      calculateFactories([mockFactory], gameData)

      expect(shouldShowInternal(mockFactory.products[0], mockFactory)).toBe(true)
    })

    it('should not show when product is not used internally', () => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 100,
        recipe: 'IngotIron',
      })
      calculateFactories([mockFactory], gameData)

      expect(shouldShowInternal(mockFactory.products[0], mockFactory)).toBe(false)
    })
  })

  describe('shouldShowFix', () => {
    it('should return null if there\'s no product', () => {
      expect(shouldShowFix({} as FactoryItem, mockFactory)).toBe(null)
    })
    it('should return null if there\'s no part', () => {
      mockFactory.parts = {}
      expect(shouldShowFix(mockFactory.products[0], mockFactory)).toBe(null)
    })
    it('should return null if there\'s no product amount', () => {
      mockFactory.products[0].amount = 0
      expect(shouldShowFix(mockFactory.products[0], mockFactory)).toBe(null)

      mockFactory.products[0].amount = 1
      expect(shouldShowFix(mockFactory.products[0], mockFactory)).toBe(null)
    })
    it('should return deficit if there\'s an deficit', () => {
      calculatePartMetrics(mockFactory, gameData)
      // Create a deficit
      mockFactory.parts.IronIngot.amountRemaining = -50

      expect(shouldShowFix(mockFactory.products[0], mockFactory)).toBe('deficit')
    })
    it('should return null if there\'s a surplus but no demand for the product via export', () => {
      calculatePartMetrics(mockFactory, gameData)
      // Create a surplus
      mockFactory.parts.IronIngot.amountRemaining = 50
      mockFactory.parts.IronIngot.amountRequired = 0

      expect(shouldShowFix(mockFactory.products[0], mockFactory)).toBe(null)
    })
    it('should return surplus if there\'s an surplus', () => {
      calculatePartMetrics(mockFactory, gameData)
      // Create a surplus
      mockFactory.parts.IronIngot.amountRequired = 50

      expect(shouldShowFix(mockFactory.products[0], mockFactory)).toBe('surplus')
    })
    it('should show nothing if it is fully satisfied even with export demands', () => {
      // Add a demand
      const mockFactory2 = newFactory('Iron Plates')

      addInputToFactory(mockFactory2, {
        factoryId: mockFactory.id,
        amount: 100,
        outputPart: 'IronIngot',
      })

      // Set the product to match the demand, thus creating an equilibrium
      mockFactory.products[0].amount = 100

      calculateFactories([mockFactory, mockFactory2], gameData)

      expect(mockFactory.parts.IronIngot.amountRequired).toBe(100)

      expect(shouldShowFix(mockFactory.products[0], mockFactory)).toBe(null)
    })
  })

  describe('shouldShowNotInDemand', () => {
    it('should not show if the product ID is missing', () => {
      expect(shouldShowNotInDemand({} as FactoryItem, mockFactory)).toBe(false)
    })
    it('should show when the product is not in demand', () => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 100,
        recipe: 'IngotIron',
      })

      calculateFactories([mockFactory], gameData)
      expect(mockFactory.parts.IronIngot.amountRequired).toBe(0)

      expect(shouldShowNotInDemand(mockFactory.products[0], mockFactory)).toBe(true)
    })

    it('should not show when product has internal demand but not export demand', () => {
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 100,
        recipe: 'IngotIron',
      })
      addProductToFactory(mockFactory, {
        id: 'IronPlate',
        amount: 100,
        recipe: 'IronPlate',
      })

      calculateFactories([mockFactory], gameData)
      expect(mockFactory.parts.IronIngot.amountRequired).toBe(150)
      expect(mockFactory.parts.IronIngot.amountRequiredExports).toBe(0)
      expect(mockFactory.parts.IronIngot.amountRequiredProduction).toBe(150)

      expect(shouldShowNotInDemand(mockFactory.products[0], mockFactory)).toBe(false)
    })
    it('should not show not in demand chip when product has export demand', () => {
      const mockFactory2 = newFactory('Iron Plates')
      addProductToFactory(mockFactory, {
        id: 'IronIngot',
        amount: 100,
        recipe: 'IngotIron',
      })
      addInputToFactory(mockFactory2, {
        factoryId: mockFactory.id,
        amount: 100,
        outputPart: 'IronIngot',
      })
      calculateFactories([mockFactory, mockFactory2], gameData)

      expect(shouldShowNotInDemand(mockFactory.products[0], mockFactory)).toBe(false)
    })
  })

  describe('fixProduct', () => {
    it('should throw an error if the product ID is missing', () => {
      const mockProduct = {
        id: '',
        amount: 100,
        recipe: 'IngotIron',
      } as FactoryItem
      expect(() => {
        fixProduct(mockProduct, mockFactory)
      }).toThrow('products: fixPart: Product ID is missing!')
    })
    it('should throw if the part is missing', () => {
      const mockProduct = {
        id: 'IronPlate',
        amount: 100,
        recipe: 'IronPlate',
      } as FactoryItem

      // Will fail as the parts haven't been calculated
      expect(() => {
        fixProduct(mockProduct, mockFactory)
      }).toThrow(`products: fixPart: Part data for "${mockProduct.id}" is missing!`)
    })
    it('should correct the product amount if it is incorrect', () => {
      const mockProduct = {
        id: 'CopperIngot',
        amount: 1000,
        recipe: 'IngotCopper',
      }

      addProductToFactory(mockFactory, mockProduct)
      calculateFactories([mockFactory], gameData)

      // Make the part amount now incorrect
      mockFactory.parts.CopperIngot.amountRequired = 123

      // It should be out of sync
      expect(mockFactory.parts.CopperIngot.amountRequired).toBe(123)
      expect(mockFactory.products[1].amount).toBe(1000)

      // Fix the product
      fixProduct(mockFactory.products[1], mockFactory) // This is important to be directly the product as it is in the factory, as it's passed via reference at the UI level

      // It should now be in sync with parts
      expect(mockFactory.parts.CopperIngot.amountRequired).toBe(123)
      expect(mockFactory.products[1].amount).toBe(123)
    })

    describe('fixProduct byproduct handling', () => {
      let factories: Factory[]
      let mockFactory: Factory
      beforeEach(() => {
        factories = create321Scenario().getFactories()
        mockFactory = factories[0]
        calculateFactories(factories, gameData)
      })
      it('should balance HOR correctly when told to trim', () => {
        fixProduct(mockFactory.products[1], mockFactory)

        expect(mockFactory.products[1].amount).toBe(40) // HOR should trim to this, 40 is made by polymer resin, 20 made by plastic
      })

      it('should balance HOR correctly when told to satisfy', () => {
        mockFactory.products[1].amount = 5
        calculateFactories([mockFactory], gameData)

        fixProduct(mockFactory.products[1], mockFactory)

        expect(mockFactory.products[1].amount).toBe(40) // HOR should be satisfied to 40
      })
    })
  })

  describe('getProduct', () => {
    it('should return a product', () => {
      const result = getProduct(mockFactory, 'IronIngot')
      expect(result).toBeDefined()
      expect(result?.id).toBe('IronIngot')
    })
    it('should return a byproduct even when not told to', () => {
      addProductToFactory(mockFactory, {
        id: 'NonFissibleUranium',
        amount: 1,
        recipe: 'NonFissileUranium',
      })
      calculateFactories([mockFactory], gameData)
      const result = getProduct(mockFactory, 'Water')
      expect(result).toBeDefined()
      expect(result?.id).toBe('Water')
    })
    it('should return a byproduct when explicitly told to', () => {
      addProductToFactory(mockFactory, {
        id: 'NonFissibleUranium',
        amount: 1,
        recipe: 'NonFissileUranium',
      })
      calculateFactories([mockFactory], gameData)
      const result = getProduct(mockFactory, 'Water', false, true)
      expect(result).toBeDefined()
      expect(result?.id).toBe('Water')
    })
    it('should return undefined when the part cannot be found amongst factory products or byproducts', () => {
      expect(getProduct(mockFactory, 'FooBar')).toBeUndefined()
    })
  })

  describe('Update product via byproduct / requirement amounts', () => {
    let factory: Factory
    let product: FactoryItem
    beforeEach(() => {
      vi.spyOn(eventBus, 'emit')

      const factories = create341Scenario().getFactories()
      factory = factories[0]
      product = factory.products[0] // Non-Fissile Uranium, note has byproduct of water

      calculateFactories(factories, gameData)
    })
    afterEach(() => {
      vi.resetAllMocks()
    })

    describe('updateProductAmountViaByproduct', () => {
      const toastEvent = {
        message: 'You cannot set a byproduct to be 0. Setting product amount to 0.1 to prevent calculation errors. <br>If you need to enter 0.x of numbers, use your cursor to do so.',
        type: 'warning',
      }
      it('should throw if byproduct is missing', () => {
        expect(() => {
          updateProductAmountViaByproduct(product, 'NotAByproduct', gameData)
        }).toThrow(`products: updateProductAmountViaByproduct: No byproduct part NotAByproduct found for product ${product.id}!`)
      })
      it('should correctly update the product amount via byproduct', () => {
        if (!product.byProducts) throw new Error('Product has no byproducts')
        product.byProducts[0].amount = 48
        updateProductAmountViaByproduct(product, 'Water', gameData)
        calculateFactories([factory], gameData)

        expect(product.amount).toBe(160)
        expect(product.byProducts[0].amount).toBe(48)
        expect(product.requirements.NuclearWaste.amount).toBe(120)
      })

      it('should prevent negative values', () => {
        if (!product.byProducts) throw new Error('Product has no byproducts')
        product.byProducts[0].amount = -1
        updateProductAmountViaByproduct(product, 'Water', gameData)
        calculateFactories([factory], gameData)

        // Ensure the event bus fired
        expect(eventBus.emit).toHaveBeenCalledWith('toast', toastEvent)

        // Should correct the product amount to 0.1
        expect(product.amount).toBe(0.1)
        expect(product.byProducts[0].amount).toBe(0.03)
        expect(product.requirements.NuclearWaste.amount).toBe(0.075)
      })

      it('should prevent zero values', () => {
        if (!product.byProducts) throw new Error('Product has no byproducts')
        product.byProducts[0].amount = 0
        updateProductAmountViaByproduct(product, 'Water', gameData)
        calculateFactories([factory], gameData)

        // Ensure the event bus fired
        expect(eventBus.emit).toHaveBeenCalledWith('toast', toastEvent)

        // Should correct the product amount to 0.1
        expect(product.amount).toBe(0.1)
        expect(product.byProducts[0].amount).toBe(0.03)
        expect(product.requirements.NuclearWaste.amount).toBe(0.075)
      })
    })
    describe('updateProductAmountByRequirement', () => {
      const toastEvent = {
        message: 'You cannot set an ingredient to be 0. Setting product amount to 0.1 to prevent calculation errors. <br>If you need to enter 0.x of numbers, use your cursor to do so.',
        type: 'warning',
      }
      it('should throw if ingredient is missing', async () => {
        await expect(updateProductAmountViaRequirement(product, 'NotAnIngredient')).rejects.toThrow(`products: updateProductAmountByRequirement: No ingredient part NotAnIngredient found for product ${product.id}!`)
      })
      it('should correctly update the product amount via requirement', () => {
        product.requirements.Silica.amount = 100
        updateProductAmountViaRequirement(product, 'Silica')
        calculateFactories([factory], gameData)

        expect(product.amount).toBe(200)
        expect(product.requirements.Silica.amount).toBe(100)
        expect(product.requirements.NitricAcid.amount).toBe(60)
      })
      it('should prevent negative values', () => {
        product.requirements.Silica.amount = -123
        updateProductAmountViaRequirement(product, 'Silica')
        calculateFactories([factory], gameData)

        // Ensure the event bus fired
        expect(eventBus.emit).toHaveBeenCalledWith('toast', toastEvent)

        // Should correct the product amount to 0.1
        expect(product.amount).toBe(0.1)
        expect(product.requirements.NuclearWaste.amount).toBe(0.075)
        expect(product.requirements.Silica.amount).toBe(0.05)
      })

      it('should prevent zero values', () => {
      // Reset the mock to ensure a clean slate
        if (!product.byProducts) throw new Error('Product has no byproducts')
        product.requirements.Silica.amount = 0
        updateProductAmountViaRequirement(product, 'Silica')
        calculateFactories([factory], gameData)

        // Ensure the event bus fired
        expect(eventBus.emit).toHaveBeenCalledWith('toast', toastEvent)

        // Should correct the product amount to 0.1
        expect(product.amount).toBe(0.1)
        expect(product.requirements.NuclearWaste.amount).toBe(0.075)
        expect(product.requirements.Silica.amount).toBe(0.05)
      })
    })
  })

  describe('getProductQtyByAmount', () => {
    let mockProduct: FactoryItem
    let mockGameData = JSON.parse(JSON.stringify(gameData))
    beforeEach(() => {
      mockProduct = { id: 'Cement', amount: 100, recipe: 'Concrete' } as FactoryItem
      mockGameData = JSON.parse(JSON.stringify(gameData))
    })
    it('should throw if no recipe is found', () => {
      const mockProduct = { id: 'IronIngot', amount: 100, recipe: 'ThisDoesNotExist' } as FactoryItem
      expect(() => {
        getProductAmountByPart(mockProduct, 'ThisDoesNotExist', 'requirement', 1234, gameData)
      }).toThrow(`products: getProductQtyByAmount: No recipe found for product ${mockProduct.id}`)
    })

    it('should return the correct product quantity for a requirement', () => {
      expect(getProductAmountByPart(mockProduct, 'Stone', 'requirement', 600, gameData)).toBe(200)
    })

    it('should return the correct product quantity for a byproduct', () => {
      mockProduct = {
        id: 'NonFissibleUranium',
        amount: 1,
        recipe: 'NonFissileUranium',
      } as FactoryItem
      expect(getProductAmountByPart(mockProduct, 'Water', 'byproduct', 12, gameData)).toBe(40)
    })

    it('should return 0.1 if no recipe amount could be found or is negative', () => {
      // Change the recipe perMin to be 0
      const concreteRecipe = getRecipe('Concrete', mockGameData)
      if (!concreteRecipe) throw new Error('Recipe not found')
      concreteRecipe.ingredients[0].perMin = 0

      expect(getProductAmountByPart(mockProduct, 'Stone', 'requirement', 1234, mockGameData)).toBe(0.1)
    })
  })

  describe('recipeByProductPerMin', () => {
    it('should throw when a byproduct is not present in a recipe', () => {
      const recipe = getRecipe('Concrete', gameData)
      if (!recipe) throw new Error('Recipe not found')
      expect(() =>
        recipeByproductPerMin('FooPart', recipe)
      ).toThrow(`products: recipeByproductPerMin: No byproduct found for part FooPart in recipe ${recipe.id}`)
    })
  })

  describe('recipeIngredientPerMin', () => {
    it('should throw when a ingredient is not present in a recipe', () => {
      const recipe = getRecipe('Concrete', gameData)
      if (!recipe) throw new Error('Recipe not found')
      expect(() =>
        recipeIngredientPerMin('FooPart', recipe)
      ).toThrow(`products: recipeIngredientPerMin: No ingredient found for part FooPart in recipe ${recipe.id}!`)
    })
  })

  describe('isPartByProductOfRecipe', () => {
    it('should detect if a part is a byproduct of a recipe', () => {
      expect(isPartByProductOfRecipe('HeavyOilResidue', 'Rubber', gameData)).toBe(true)
      expect(isPartByProductOfRecipe('Water', 'Battery', gameData)).toBe(true)
      expect(isPartByProductOfRecipe('SulfuricAcid', 'UraniumCell', gameData)).toBe(true)
    })

    it('should not incorrectly detect a byproduct-able part being a byproduct if it is an actual product', () => {
      // Check it's not detecting legitimate parts as byproducts
      expect(isPartByProductOfRecipe('UraniumCell', 'UraniumCell', gameData)).toBe(false)

      // Check if it's not detecting itself being a byproduct of other recipes when it is an product in it's own right
      expect(isPartByProductOfRecipe('Water', 'UnpackageWater', gameData)).toBe(false)
      expect(isPartByProductOfRecipe('SulphuricAcid', 'SulfuricAcid', gameData)).toBe(false)
    })
  })

  describe('byProductAsProductCheck', () => {
    afterEach(() => {
      vi.resetAllMocks()
    })
    it('should correctly swap out a byproduct recipe for a product recipe', () => {
      const product = {
        id: 'HeavyOilResidue',
        amount: 100,
        recipe: 'Rubber',
      } as FactoryItem

      byProductAsProductCheck(product, gameData)

      expect(product).toEqual({
        id: product.recipe,
        amount: 100,
        recipe: product.recipe,
      })
    })

    it('should not affect already correct recipes', () => {
      const product = {
        id: 'Water',
        amount: 100,
        recipe: 'UnpackageWater',
      } as FactoryItem

      byProductAsProductCheck(product, gameData)

      expect(product).toEqual({
        id: product.id,
        amount: 100,
        recipe: product.recipe,
      })
    })

    it('should emit an event to the user when it has changed', () => {
      const product = {
        id: 'HeavyOilResidue',
        amount: 100,
        recipe: 'Rubber',
      } as FactoryItem
      vi.spyOn(eventBus, 'emit')

      byProductAsProductCheck(product, gameData)

      expect(eventBus.emit).toHaveBeenCalledWith('toast', {
        message: 'The chosen Byproduct <b>Heavy Oil Residue</b> was swapped for the producing Product <b>Rubber</b>.<br>Update the Byproduct ingredient on <b>Rubber</b> for the desired item quantity.',
        type: 'info',
        timeout: 10000,
      })
    })
  })

  describe('building groups', () => {
    it('when a product is added, the correct building count and underclock should be applied', () => {
      const mockFactory = newFactory('Batteries')
      addProductToFactory(mockFactory, {
        id: 'Battery',
        amount: 1,
        recipe: 'Battery',
      })
      const product = mockFactory.products[0]
      const buildingGroup = product.buildingGroups[0]

      expect(buildingGroup).toBeDefined()

      expect(buildingGroup.buildingCount).toBe(1)
      expect(buildingGroup.overclockPercent).toBe(5)
    })
  })
})
