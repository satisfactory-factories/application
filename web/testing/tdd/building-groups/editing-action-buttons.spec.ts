import { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addProductToFactory } from '../../../src/utils/factory-management/products'
import {
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

describe('TDD: BG-E-AB-PROD: Building Groups: Action Buttons (Products)', () => {
  let factory: Factory
  let product: FactoryItem
  let subject: VueWrapper

  // Elements
  let addBuildingGroupButton: any
  let toggleSyncButton: any

  beforeEach(() => {
    factory = reactive(newFactory('BC-E-AB-PROD Factory'))
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 60, // 2 Buildings
      recipe: 'IngotIron',
    })
    product = factory.products[0]
    product.buildingGroupsTrayOpen = true // This is needed otherwise nothing renders
    calculateFactories([factory], gameData)
    subject = mountProduct(factory)

    // Elements
    addBuildingGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
    toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
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

    test('BG-E-AB-PROD-2: Enable Evenly Balance button when multiple building groups WITHOUT need of remainder', async () => {
      // Add a second group
      await addBuildingGroupButton.trigger('click')
      // re-find the balance button
      evenlyBalanceButton = subject.find(`[id="${factory.id}-${product.id}-evenly-balance"]`)

      // By default they are NOT evenly balanced (2 and 1)
      expect(evenlyBalanceButton.classes()).not.toContain('v-btn--disabled')

      // Now balance them
      await evenlyBalanceButton.trigger('click')
      // Re-find
      evenlyBalanceButton = subject.find(`[id="${factory.id}-${product.id}-evenly-balance"]`)
      expect(evenlyBalanceButton.classes()).toContain('v-btn--disabled')
    })

    test('BG-E-AB-PROD-3: Disable Evenly Balance button if all building groups have the same building counts and clocks', async () => {
      await addBuildingGroupButton.trigger('click')
      evenlyBalanceButton = subject.find(`[id="${factory.id}-${product.id}-evenly-balance"]`)

      // Set them to be the same
      product.buildingGroups[0].buildingCount = 1
      product.buildingGroups[1].buildingCount = 1
      product.buildingGroups[0].overclockPercent = 100
      product.buildingGroups[1].overclockPercent = 100

      await subject.vm.$nextTick()

      // Re-find
      evenlyBalanceButton = subject.find(`[id="${factory.id}-${product.id}-evenly-balance"]`)
      expect(evenlyBalanceButton.classes()).toContain('v-btn--disabled')
    })

    test('BG-E-AB-PROD-4: When effective is under balanced, "Under Producing!" is shown', async () => {
      // Set to under-producing
      product.buildingGroups[0].buildingCount = 1
      product.buildingGroupItemSync = false
      // Requirement is 2 (amount 60)

      await new Promise(resolve => setTimeout(resolve, 100))
      expect(subject.text()).toContain('Under producing!')
    })

    test('BG-E-AB-PROD-5: When effective is over balanced, "Over Producing!" is shown', async () => {
      // Set to over-producing
      product.buildingGroups[0].buildingCount = 3
      product.buildingGroupItemSync = false

      await new Promise(resolve => setTimeout(resolve, 100))
      expect(subject.text()).toContain('Over producing!')
    })

    test('BG-E-AB-PROD-6: When effective is balanced, "Balanced" is shown', async () => {
      // Balanced is 2 buildings
      product.buildingGroups[0].buildingCount = 2

      await new Promise(resolve => setTimeout(resolve, 100))
      expect(subject.text()).toContain('Balanced')
    })

    test('BG-E-AB-PROD-13: When any group has clock of !== 100%, show OC @ 100% button', async () => {
      product.buildingGroups[0].overclockPercent = 50
      await subject.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 100))

      const ocButton = subject.find('button:has(.fa-history)')
      expect(ocButton.exists()).toBe(true)
      expect(ocButton.classes()).not.toContain('v-btn--disabled')

      await ocButton.trigger('click')
      await subject.vm.$nextTick()
      expect(product.buildingGroups[0].overclockPercent).toBe(100)
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
