import { VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addProductToFactory } from '../../../src/utils/factory-management/products'
import { BuildingGroup, Factory, FactoryItem, ItemType } from '../../../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../../../src/utils/gameDataService'
import { addBuildingGroup, deleteBuildingGroup } from '../../../src/utils/factory-management/building-groups/common'
import { deleteItem } from '../../../src/utils/factory-management/common'
import { mountItem } from '../../helpers'

// @ts-ignore // this is fine, it works, stop moaning
const gameData = await fetchGameData()

const mountProduct = (factory: Factory) => {
  return mountItem(factory, Product)
}

describe('TDD: BG-C-D: Building Groups: Creation and Deletion', () => {
  let factory: Factory
  let product: FactoryItem
  let buildingGroup: BuildingGroup
  let subject: VueWrapper

  // Elements
  let addBuildingGroupButton: any
  let toggleSyncButton: any

  beforeEach(() => {
    factory = newFactory('BC-C-D Factory')
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 60, // 2 Buildings
      recipe: 'IngotIron',
    })
    product = reactive(factory.products[0])
    product.buildingGroupsTrayOpen = true // This is needed otherwise nothing renders
    buildingGroup = product.buildingGroups[0]
    calculateFactories([factory], gameData)
    subject = mountProduct(factory)

    // Elements
    addBuildingGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
    toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
  })

  describe('creation', () => {
    test('BG-C-D-1: Create a new building group upon product addition', async () => {
      expect(buildingGroup.buildingCount).toBe(2)
    })

    test('BG-C-D-2: Create a second building group', async () => {
      addBuildingGroup(product, ItemType.Product, factory)

      expect(product.buildingGroups[1].buildingCount).toBe(1)
      // It should not have affected the product or the other group
      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingRequirements.amount).toBe(2)
    })

    test('BG-C-D-2: Create a second building group via UI', async () => {
      await addBuildingGroupButton.trigger('click')

      expect(product.buildingGroups[1].buildingCount).toBe(1)
      // It should not have affected the product or the other group
      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingRequirements.amount).toBe(2)
    })

    test('BG-C-D-2.1: Creating a second building group via UI adds the default of 1', async () => {
      await addBuildingGroupButton.trigger('click')

      expect(product.buildingGroups[1].buildingCount).toBe(1)
      // It should not have affected the product or the other group
      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingRequirements.amount).toBe(2)

      // It should generate the metrics on the new group
      expect(product.buildingGroups[1].parts.IronIngot).toBe(30)

      // It should have updated the effective buildings
      const effectiveBuildings = subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`)
      const remainingBuildings = subject.find(`[id="${factory.id}-${product.id}-remaining-buildings"]`)
      const remainingBuildingsVerb = subject.find(`[id="${factory.id}-${product.id}-remaining-buildings-verb"]`)
      expect(effectiveBuildings.text()).toBe('3.00')
      expect(remainingBuildings.text()).toBe('1.00')
      expect(remainingBuildingsVerb.text()).toBe('over')
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

    test('BG-C-D-5: Additional building groups default to 1 building', () => {
      // Add new building groups
      addBuildingGroup(product, ItemType.Product, factory)
      addBuildingGroup(product, ItemType.Product, factory)

      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingGroups[1].buildingCount).toBe(1)
      expect(product.buildingGroups[2].buildingCount).toBe(1)
    })

    test('BG-C-D-5: Additional building groups default to 1 building via UI', async () => {
      // Add new building groups
      await addBuildingGroupButton.trigger('click')
      await addBuildingGroupButton.trigger('click')

      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingGroups[1].buildingCount).toBe(1)
      expect(product.buildingGroups[2].buildingCount).toBe(1)
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

      const deleteButton = subject.find(`[id="${factory.id}-${buildingGroup.id}-delete"]`)
      const deleteButtonNewGroup = subject.find(`[id="${factory.id}-${product.buildingGroups[1].id}-delete"]`)
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

      const deleteButton = subject.find(`[id="${factory.id}-${buildingGroup.id}-delete"]`)
      await deleteButton.trigger('click')

      expect(product.buildingGroups.length).toBe(1)
    })

    test('BG-C-D-8: Deleting a product removes it\'s building groups', async () => {
      expect(product.buildingGroups.length).toBe(1)

      // Delete the product
      deleteItem(0, ItemType.Product, factory)

      expect(factory.products[0]?.buildingGroups).toBeUndefined()
    })

    test('BG-C-D-8: Deleting a building group removes it from the product data model', async () => {
      // Add a second building group
      addBuildingGroup(product, ItemType.Product, factory)

      expect(product.buildingGroups.length).toBe(2)

      // Delete the original building group
      deleteBuildingGroup(product, product.buildingGroups[0])

      expect(product.buildingGroups.length).toBe(1)
    })

    test('BG-C-D-8: Deleting a building group removes it from the product via UI', async () => {
      // Add a second building group
      await addBuildingGroupButton.trigger('click')
      const buildingGroup2 = product.buildingGroups[1]

      // Remount the product
      subject.unmount()
      subject = mountProduct(factory)

      // Check for existence of both building groups
      expect(product.buildingGroups.length).toBe(2)
      expect(subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`).exists()).toBe(true)
      expect(subject.find(`[id="${factory.id}-${buildingGroup2.id}-building-count"]`).exists()).toBe(true)

      const deleteButton = subject.find(`[id="${factory.id}-${buildingGroup.id}-delete"]`)
      await deleteButton.trigger('click')

      // Check the UI shows it removed
      expect(subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`).exists()).toBe(false)
      expect(subject.find(`[id="${factory.id}-${buildingGroup2.id}-building-count"]`).exists()).toBe(true)

      expect(product.buildingGroups.length).toBe(1)
    })

    test('BG-C-D-9: Deleting a building group causes a building group imbalance via UI', async () => {
      // Add a second building group
      await addBuildingGroupButton.trigger('click')
      expect(product.buildingGroupItemSync).toBe(false)

      // Enable sync
      toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
      await toggleSyncButton.trigger('click')
      expect(product.buildingGroupItemSync).toBe(true)

      // Update the product amount to create a balance of 2 groups with 1 building
      const productAmountInput = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
      await productAmountInput.setValue('60')

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Now we delete a group
      const deleteButton = subject.find(`[id="${factory.id}-${buildingGroup.id}-delete"]`)
      await deleteButton.trigger('click')

      // Re-find elements because they might have been re-rendered
      const effectiveBuildingsVal = subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`)
      const remainingBuildingsVal = subject.find(`[id="${factory.id}-${product.id}-remaining-buildings"]`)

      // Check the current state of the building groups balance, it should be 1 with 1 remaining
      expect(effectiveBuildingsVal.text()).toBe('1.00')
      expect(remainingBuildingsVal.text()).toBe('1.00') // Thus, imbalance.
      // Sync should have been disabled
      expect(product.buildingGroupItemSync).toBe(false)
    })

    test('BG-C-D-10: Deletion of building groups to 1 remaining disables the delete group button', async () => {
      // Add a second building group
      await addBuildingGroupButton.trigger('click')
      expect(product.buildingGroups.length).toBe(2)

      const deleteButton = subject.find(`[id="${factory.id}-${product.buildingGroups[0].id}-delete"]`)
      let deleteButton2 = subject.find(`[id="${factory.id}-${product.buildingGroups[1].id}-delete"]`)
      expect(deleteButton.attributes('disabled')).toBe(undefined)
      expect(deleteButton2.attributes('disabled')).toBe(undefined)

      // Delete one
      await deleteButton.trigger('click')
      expect(product.buildingGroups.length).toBe(1)

      // Now the remaining one should be disabled
      deleteButton2 = subject.find(`[id="${factory.id}-${product.buildingGroups[0].id}-delete"]`)
      expect(deleteButton2.attributes('disabled')).toBeDefined()
    })

    test('BG-C-D-11: Deletion of building groups to 1 remaining disables the evenly balance button', async () => {
      // Add a second building group
      await addBuildingGroupButton.trigger('click')
      expect(product.buildingGroups.length).toBe(2)

      const balanceButton = subject.find(`[id="${factory.id}-${product.id}-evenly-balance"]`)
      expect(balanceButton.attributes('disabled')).toBe(undefined)

      // Delete one
      const deleteButton = subject.find(`[id="${factory.id}-${product.buildingGroups[0].id}-delete"]`)
      await deleteButton.trigger('click')
      expect(product.buildingGroups.length).toBe(1)

      // Balance button should be disabled
      expect(balanceButton.attributes('disabled')).toBeDefined()
    })
  })
})
