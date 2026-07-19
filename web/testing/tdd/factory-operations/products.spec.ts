import { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addProductToFactory } from '../../../src/utils/factory-management/products'
import { Factory, FactoryItem, ItemType } from '../../../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../../../src/utils/gameDataService'
import { deleteItem } from '../../../src/utils/factory-management/common'
import { mountItem, mountSatisfaction } from '../../helpers'

// @ts-ignore // this is fine, it works, stop moaning
const gameData = await fetchGameData()

const mountProduct = (factory: Factory) => {
  return mountItem(factory, Product)
}

describe('TDD: FAC-PROD: Factory Products', () => {
  let factory: Factory
  let product: FactoryItem
  let subject: VueWrapper

  beforeEach(() => {
    factory = newFactory('FAC-PROD-CD Factory')
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 60, // 2 Buildings
      recipe: 'IngotIron',
    })
    product = factory.products[0]
    product.buildingGroupsTrayOpen = true // This is needed otherwise nothing renders
    calculateFactories([factory], gameData)
    subject = mountProduct(factory)
  })

  describe('FAC-PROD-CD: creation', () => {
    test('FAC-PROD-CD-1: Creating a new product adds an empty product', () => {
      const emptyFactory = newFactory('FAC-PROD-CD-1 Factory')
      // Mirrors addEmptyProduct in ProductsAndPower.vue
      addProductToFactory(emptyFactory, { id: '', amount: 1 })

      expect(emptyFactory.products.length).toBe(1)
      expect(emptyFactory.products[0].id).toBe('')
      expect(emptyFactory.products[0].recipe).toBe('')
    })

    test('FAC-PROD-CD-2: Upon entering a recipe for a product, factory satisfaction updates', () => {
      const newProductFactory = newFactory('FAC-PROD-CD-2 Factory')
      // Start with an empty product, as the UI does
      addProductToFactory(newProductFactory, { id: '', amount: 1 })
      calculateFactories([newProductFactory], gameData)

      // No recipe yet, so nothing is produced or demanded
      expect(newProductFactory.parts.IronIngot).toBeUndefined()

      // User selects the item and recipe
      newProductFactory.products[0].id = 'IronIngot'
      newProductFactory.products[0].recipe = 'IngotIron'
      calculateFactories([newProductFactory], gameData)

      // Satisfaction now reflects the produced part and its ingredient demand
      expect(newProductFactory.parts.IronIngot).toBeDefined()
      expect(newProductFactory.parts.IronIngot.amountSupplied).toBeGreaterThan(0)
      expect(newProductFactory.parts.OreIron).toBeDefined()
    })
  })

  describe('FAC-PROD-CD: deletion', () => {
    test('FAC-PROD-CD-3: Deleting a product removes it from the factory', async () => {
      expect(factory.products.length).toBe(1)

      deleteItem(0, ItemType.Product, factory)
      calculateFactories([factory], gameData)

      expect(factory.products.length).toBe(0)
      expect(factory.parts.IronIngot?.amountSupplied).toBeUndefined()
    })

    test('FAC-PROD-CD-4: Deletion of the product removes the part difference from the factory (single product) via data model', async () => {
      // Assert the part list before
      expect(factory.parts.IronIngot.amountSupplied).toBe(60)

      // Delete the product
      deleteItem(0, ItemType.Product, factory)
      // Perform what the UI would and recalculate the factory
      calculateFactories([factory], gameData)

      expect(factory.parts.IronIngot?.amountSupplied).toBeUndefined()
    })

    test('FAC-PROD-CD-4: Deletion of the product removes the part difference from the factory (multi products) via data model', async () => {
      // Add another product of the same item so the parts won't be undefined
      addProductToFactory(factory, {
        id: 'IronIngot',
        amount: 30, // 1 Building
        recipe: 'IngotIron',
      })

      calculateFactories([factory], gameData)

      // Assert the part list before
      expect(factory.parts.IronIngot.amountRemaining).toBe(90) // 2+1 buildings

      // Delete the original product
      deleteItem(0, ItemType.Product, factory)
      // Perform what the UI would and recalculate the factory
      calculateFactories([factory], gameData)

      expect(factory.parts.IronIngot?.amountRemaining).toBe(30) // 1 building
    })

    test('FAC-PROD-CD-4: Deletion of the product removes the part difference from the factory (multi products) via UI', async () => {
      // Add another product of the same item so the parts won't be undefined
      addProductToFactory(factory, {
        id: 'IronIngot',
        amount: 30, // 1 Building
        recipe: 'IngotIron',
      })

      // Calculate to ensure everything is updated.
      calculateFactories([factory], gameData)

      // Remount as the UI will have been updated.
      subject.unmount()
      subject = mountProduct(factory)
      // Also mount the Satisfaction component to get the details
      const satisfactionSubject = mountSatisfaction(factory)

      // Assert the part list before
      expect(factory.parts.IronIngot.amountRemaining).toBe(90) // 2+1 buildings
      const ironIngotsElem = satisfactionSubject.find(`[id="${factory.id}-satisfaction-IronIngot-remaining"]`)
      expect(ironIngotsElem.text()).toBe('90')

      const deleteItemButton = subject.find(`[id="${factory.id}-item-1-delete"]`)
      await deleteItemButton.trigger('click')

      // Assert the part list after
      expect(factory.parts.IronIngot?.amountRemaining).toBe(60) // 2 buildings from original product
    })
  })
})
