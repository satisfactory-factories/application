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

  describe('Sync on', () => {
    beforeEach(() => {
      product.buildingGroupItemSync = true
      expect(product.buildingGroupItemSync).toBe(true)
    })

    describe('Single group', () => {
      beforeEach(() => {
        // Assert the before
        expect(buildingGroup.buildingCount).toBe(2)
        expect(buildingGroupCount.attributes('value')).toBe('2')
        expect(itemBuildingCount.attributes('value')).toBe('2')
      })
      test('BG-I-E-PROD-7: Changing the product quantity updates the building group building count', async () => {
        // Update the product quantity, after debounce it should have updated the building group and effective buildings
        await itemAmount.setValue(120)

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Assert the after
        expect(buildingGroup.buildingCount).toBe(4)
        expect(buildingGroupCount.attributes('value')).toBe('4')
        expect(itemBuildingCount.attributes('value')).toBe('4')
      })

      test('BG-I-E-PROD-8: Changing the product building count updates the building group building count', async () => {
        // Update the product building count, after debounce it should have updated the building group and effective buildings
        await itemBuildingCount.setValue(4)

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Assert the after
        expect(buildingGroup.buildingCount).toBe(4)
        expect(buildingGroupCount.attributes('value')).toBe('4')
        expect(itemBuildingCount.attributes('value')).toBe('4')
      })
    })

    describe('Multiple groups', () => {

    })
  })
})
