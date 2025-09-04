import { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import PowerProducer from '../../../src/components/planner/products/PowerProducer.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addProductToFactory } from '../../../src/utils/factory-management/products'
import {
  BuildingGroup,
  Factory,
  FactoryItem,
} from '../../../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../../../src/utils/gameDataService'
import { mountItem } from '../../helpers'

// @ts-ignore // this is fine, it works, stop moaning
const gameData = await fetchGameData()

const mountProduct = (factory: Factory) => {
  return mountItem(factory, Product)
}

const mountPowerProducer = (factory: Factory) => {
  return mountItem(factory, PowerProducer)
}

describe('TDD: BG-E-AB-PROD: Building Groups: Action Buttons (Products)', () => {
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
    factory = newFactory('BC-E-AB-PROD Factory')
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

  describe('evenly balance button', () => {
    let evenlyBalanceButton: any
    beforeEach(() => {
      evenlyBalanceButton = subject.find(`[id="${factory.id}-${product.id}-evenly-balance"]`)
    })

    test('BG-E-AB-PROD-1: Disable Evenly Balance button for singular building group', () => {
      // With a single group the button should be disabled.
      // We need to check for the "v-btn--disabled" class
      expect(evenlyBalanceButton.classes()).toContain('v-btn--disabled')
    })
  })

  describe('sync', () => {
    test('BG-E-AB-PROD-15: Sync is shown as enabled upon creating a new product', () => {
      expect(product.buildingGroupItemSync).toBe(true)
      expect(toggleSyncButton.text()).toBe('Enabled')
    })

    test('BG-E-AB-PROD-16: Pressing Sync button disables sync for the item when enabled', async () => {
      expect(toggleSyncButton.text()).toBe('Enabled')

      await toggleSyncButton.trigger('click')

      // We need to re-find it again as the element is replaced
      toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
      expect(product.buildingGroupItemSync).toBe(false)
      expect(toggleSyncButton.text()).toBe('Disabled')
    })

    test('BG-E-AB-PROD-17: Pressing "Sync" enables sync for the item when disabled', async () => {
      product.buildingGroupItemSync = false

      // We need to remount the subject to refresh the state, tried done it just on the button and an await promise but it didn't work.
      subject = mountProduct(factory)
      toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
      expect(toggleSyncButton.text()).toBe('Disabled')

      // Click the button to enable sync
      await toggleSyncButton.trigger('click')

      // We need to re-find it again as the element is replaced
      toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
      expect(product.buildingGroupItemSync).toBe(true)
      expect(toggleSyncButton.text()).toBe('Enabled')
    })
  })
})
