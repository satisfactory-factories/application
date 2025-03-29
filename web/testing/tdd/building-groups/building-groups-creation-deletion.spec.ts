import vuetify from '@/plugins/vuetify'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '@/components/planner/products/Product.vue'
import PowerProducer from '@/components/planner/products/PowerProducer.vue'
import { calculateFactories, calculateFactory, CalculationModes, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { BuildingGroup, Factory, FactoryItem, ItemType } from '@/interfaces/planner/FactoryInterface'
import { fetchGameData } from '@/utils/gameDataService'
import { addBuildingGroup, deleteBuildingGroup } from '../../../src/utils/factory-management/building-groups/common'
import { deleteItem } from '../../../src/utils/factory-management/common'

const gameData = await fetchGameData()

const mountProduct = (factory: Factory) => {
  return mountComponent(factory, Product)
}

const mountPowerProducer = (factory: Factory) => {
  return mountComponent(factory, PowerProducer)
}

const mountComponent = (factory: Factory, component: any) => {
  return mount(component, {
    propsData: {
      factory,
      helpText: false,
    },
    global: {
      plugins: [vuetify],
      provide: {
        updateFactory: (factory: any, modes: CalculationModes) => {
          calculateFactory(factory, [factory], gameData, modes)
        },
        updateOrder: (factory: any) => {
          return 'foo'
        },
      },
    },
  })
}

describe('TDD: BG-C-D: Building Groups: Creation and Deletion', () => {
  let factory: Factory
  let product: FactoryItem
  let buildingGroup: BuildingGroup
  let subject: VueWrapper

  // Elements
  let addBuildingGroupButton: any
  let toggleSyncButton: any
  let buildingGroupCount: any
  let buildingGroupClock: any
  let itemBuildingCount: any

  beforeEach(() => {
    factory = newFactory('BC-C-D Factory')
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 60, // 2 Buildings
      recipe: 'IngotIron',
    })
    product = factory.products[0]
    product.buildingGroupsTrayOpen = true // This is needed otherwise nothing renders
    buildingGroup = product.buildingGroups[0]
    calculateFactories([factory], gameData)
    subject = mountProduct(factory)

    // Elements
    addBuildingGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
    toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
    buildingGroupCount = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
    buildingGroupClock = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    itemBuildingCount = subject.find(`[id="${factory.id}-${product.id}-building-count"]`)
  })

  describe('creation', () => {
    test('BG-C-D-1: Create a new building group upon product addition', async () => {
      expect(buildingGroup.buildingCount).toBe(1)
    })

    test('BG-C-D-2: Create a second building group', async () => {
      addBuildingGroup(product, ItemType.Product, factory)

      expect(product.buildingGroups[1].buildingCount).toBe(0)
      // It should not have affected the product or the other group
      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingRequirements.amount).toBe(2)
    })

    test('BG-C-D-2: Create a second building group via UI', async () => {
      await addBuildingGroupButton.trigger('click')

      expect(product.buildingGroups[1].buildingCount).toBe(0)
      // It should not have affected the product or the other group
      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingRequirements.amount).toBe(2)
    })

    test('BG-C-D-3: Upon creating new product, creates a BG count with the expected building size', async () => {
      addProductToFactory(factory, {
        id: 'CopperIngot',
        amount: 600, // 20 Buildings
        recipe: 'IngotCopper',
      })
      const product2 = factory.products[1]

      expect(product2.buildingGroups[0].buildingCount).toBe(20)
      // It should not affect the other product or BG
      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingRequirements.amount).toBe(2)
    })

    test('BG-C-D-4: Creating a new building group with preexisting groups disables item sync', async () => {
      product.buildingGroupItemSync = true
      expect(product.buildingGroupItemSync).toBe(true)

      // Add a new building group
      addBuildingGroup(product, ItemType.Product, factory)

      expect(product.buildingGroupItemSync).toBe(false)
    })
    test('BG-C-D-4: Creating a new building group with preexisting groups disables item sync via UI', async () => {
      // Add a new building group
      await addBuildingGroupButton.trigger('click')

      expect(product.buildingGroupItemSync).toBe(false)
      // Check the UI shows it disabled. We need to re-find the button as it is replaced
      toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
      expect(toggleSyncButton.text()).toBe('Disabled')
    })

    test('BG-C-D-5: Create multiple building groups, with a 0 building default count', () => {
      // Add new building groups
      addBuildingGroup(product, ItemType.Product, factory)
      addBuildingGroup(product, ItemType.Product, factory)

      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingGroups[1].buildingCount).toBe(0)
      expect(product.buildingGroups[2].buildingCount).toBe(0)
    })

    test('BG-C-D-5: Create multiple building groups, with a 0 building default count via UI', async () => {
      // Add new building groups
      await addBuildingGroupButton.trigger('click')
      await addBuildingGroupButton.trigger('click')

      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingGroups[1].buildingCount).toBe(0)
      expect(product.buildingGroups[2].buildingCount).toBe(0)
    })
  })
  describe('deletion', () => {
    test('BG-C-D-6: Prevent deletion of a building group when last remaining', async () => {
      expect(product.buildingGroups.length).toBe(1)

      // Attempt to delete only building group available, it should be ignored
      deleteBuildingGroup(product, buildingGroup)

      expect(product.buildingGroups.length).toBe(1)
    })

    test('BG-C-D-6: Prevent deletion of a building group when last remaining via UI', async () => {
      await addBuildingGroupButton.trigger('click')

      const deleteButton = subject.find(`[id="${factory.id}-${buildingGroup.id}-delete-building-group"]`)
      const deleteButtonNewGroup = subject.find(`[id="${factory.id}-${product.buildingGroups[1].id}-delete-building-group"]`)
      expect(deleteButton.attributes('disabled')).toBe(undefined)

      await deleteButton.trigger('click')
      expect(product.buildingGroups.length).toBe(1)
      expect(deleteButtonNewGroup.attributes('disabled')).toBeDefined()
    })

    test('BG-C-D-7: Delete a building group when multiple', async () => {
      addBuildingGroup(product, ItemType.Product, factory)
      expect(product.buildingGroups.length).toBe(2)

      deleteBuildingGroup(product, buildingGroup)

      expect(product.buildingGroups.length).toBe(1)
    })

    test('BG-C-D-7: Delete a building group when multiple via UI', async () => {
      // Add new building groups
      await addBuildingGroupButton.trigger('click')
      expect(product.buildingGroups.length).toBe(2)

      const deleteButton = subject.find(`[id="${factory.id}-${buildingGroup.id}-delete-building-group"]`)
      await deleteButton.trigger('click')

      expect(product.buildingGroups.length).toBe(1)
    })

    test('BG-C-D-8: Deleting a product removes it\'s building groups', async () => {
      expect(product.buildingGroups.length).toBe(1)

      // Delete the product
      deleteItem(0, ItemType.Product, factory)

      expect(factory.products[0]?.buildingGroups).toBeUndefined()
    })

    test('BG-C-D-9: Deletion of the product removes the part difference from the factory (single product)', async () => {
      // Assert the part list before
      expect(factory.parts.IronIngot.amountSupplied).toBe(60)

      // Delete the product
      deleteItem(0, ItemType.Product, factory)
      // Perform what the UI would and recalculate the factory
      calculateFactories([factory], gameData)

      expect(factory.parts.IronIngot?.amountSupplied).toBeUndefined()

      // Add another product of the same item so the parts won't be undefined
      addProductToFactory(factory, {
        id: 'IronIngot',
        amount: 30, // 1 Building
        recipe: 'IngotIron',
      })
    })

    test('BG-C-D-9: Deletion of the product removes the part difference from the factory (multi products)', async () => {
      // Add another product of the same item so the parts won't be undefined
      addProductToFactory(factory, {
        id: 'IronIngot',
        amount: 30, // 1 Building
        recipe: 'IngotIron',
      })

      calculateFactories([factory], gameData)

      // Assert the part list before
      expect(factory.parts.IronIngot.amountSupplied).toBe(90) // 2+1 buildings

      // Delete the original product
      deleteItem(0, ItemType.Product, factory)
      // Perform what the UI would and recalculate the factory
      calculateFactories([factory], gameData)

      expect(factory.parts.IronIngot?.amountSupplied).toBe(30) // 1 building
    })

    // TODO: Not complete
    test('BG-C-D-9: Deletion of the product removes the part difference from the factory (multi products) via UI', async () => {
      // // Add another product of the same item so the parts won't be undefined
      // addProductToFactory(factory, {
      //   id: 'IronIngot',
      //   amount: 30, // 1 Building
      //   recipe: 'IngotIron',
      // })
      //
      // calculateFactories([factory], gameData)
      //
      // // Assert the part list before
      // expect(factory.parts.IronIngot.amountSupplied).toBe(90) // 2+1 buildings
      //
      // // Delete the original product
      // deleteItem(0, ItemType.Product, factory)
      // // Perform what the UI would and recalculate the factory
      // calculateFactories([factory], gameData)
      //
      // expect(factory.parts.IronIngot?.amountSupplied).toBe(30) // 1 building
    })
  })
})
