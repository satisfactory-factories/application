import { VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import PowerProducer from '../../../src/components/planner/products/PowerProducer.vue'
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

const mountPowerProducer = (factory: Factory) => {
  return mountItem(factory, PowerProducer)
}

describe('TDD: BG-I-E-PROD: Item Editing', () => {
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
  let itemAmount: any

  beforeEach(() => {
    factory = newFactory('BG-I-E-PROD Factory')
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
    buildingGroupCount = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
    buildingGroupClock = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    itemBuildingCount = subject.find(`[id="${factory.id}-${product.id}-building-count"]`)
    itemAmount = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
  })

  describe('Editing', () => {
    test('BG-I-E-PROD-1: Editing the product item recreates the building group @ 1 building', async () => {
      // Assert the before
      expect(buildingGroup.buildingCount).toBe(2)
      expect(subject.find(`[id="${factory.id}-${product.id}-building-count"]`).element.value).toBe('2')

      const productItem = subject.findComponent({ name: 'VAutocomplete' })
      // Update the item to Copper Ingots
      productItem.vm.$emit('update:modelValue', 'CopperIngot')

      // Wait for the UI to update
      await new Promise(resolve => setTimeout(resolve, 1000))
      expect(product.id).toBe('CopperIngot')
      expect(product.recipe).toBe('IngotCopper')
      // Building groups should have been reset to 1
      expect(product.buildingGroups.length).toBe(1)
      expect(product.buildingGroups[0].buildingCount).toBe(1)
    })
  })

  describe('Sync on', () => {
    beforeEach(() => {
      product.buildingGroupItemSync = true
      expect(product.buildingGroupItemSync).toBe(true)
    })

    describe('Single group', () => {
      beforeEach(() => {
        // Assert the before
        expect(buildingGroup.buildingCount).toBe(2)
        expect(subject.find(`[id="${factory.id}-${product.id}-building-count"]`).element.value).toBe('2')
      })
      test('BG-I-E-PROD-7: Changing the product quantity updates the building group building count', async () => {
        // Update the product quantity, after debounce it should have updated the building group and effective buildings
        const itemAmountInput = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
        await itemAmountInput.setValue(120)

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Assert the after
        expect(product.buildingGroups[0].buildingCount).toBe(4)
        expect(subject.find(`[id="${factory.id}-${product.buildingGroups[0].id}-building-count"]`).element.value).toBe('4')
        expect(subject.find(`[id="${factory.id}-${product.id}-building-count"]`).element.value).toBe('4')
      })

      test('BG-I-E-PROD-8: Changing the product building count updates the building group building count', async () => {
        // Update the product building count, after debounce it should have updated the building group and effective buildings
        const itemBCountInput = subject.find(`[id="${factory.id}-${product.id}-building-count"]`)
        await itemBCountInput.setValue(4)

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Assert the after
        expect(product.buildingGroups[0].buildingCount).toBe(4)
        expect(subject.find(`[id="${factory.id}-${product.buildingGroups[0].id}-building-count"]`).element.value).toBe('4')
        expect(subject.find(`[id="${factory.id}-${product.id}-building-count"]`).element.value).toBe('4')
      })
    })

    describe('Multiple groups', () => {
      beforeEach(async () => {
        // Add a second building group
        await addBuildingGroupButton.trigger('click')
        expect(product.buildingGroups.length).toBe(2)
        // Set sync back to ON
        product.buildingGroupItemSync = true
        // Set amount back to 120 (4 buildings) then back to 60 (2 buildings) to force rebalance
        const itemAmountInput = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
        await itemAmountInput.setValue(120)
        await new Promise(resolve => setTimeout(resolve, 1000))
        await itemAmountInput.setValue(60)
        await new Promise(resolve => setTimeout(resolve, 1000))

        expect(product.buildingGroups[0].buildingCount).toBe(1)
        expect(product.buildingGroups[1].buildingCount).toBe(1)
      })

      test('BG-I-E-PROD-11: Changing the product quantity triggers a rebalance', async () => {
        const itemAmountInput = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
        await itemAmountInput.setValue(120) // 4 buildings
        await new Promise(resolve => setTimeout(resolve, 1000))

        expect(product.buildingGroups[0].buildingCount).toBe(2)
        expect(product.buildingGroups[1].buildingCount).toBe(2)
      })

      test('BG-I-E-PROD-12: Changing the product building count triggers a rebalance', async () => {
        const itemBCountInput = subject.find(`[id="${factory.id}-${product.id}-building-count"]`)
        await itemBCountInput.setValue(4)
        await new Promise(resolve => setTimeout(resolve, 1000))

        expect(product.buildingGroups[0].buildingCount).toBe(2)
        expect(product.buildingGroups[1].buildingCount).toBe(2)
      })
    })
  })
})
