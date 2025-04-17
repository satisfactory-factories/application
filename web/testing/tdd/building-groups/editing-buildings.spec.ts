import { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import PowerProducer from '../../../src/components/planner/products/PowerProducer.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addProductToFactory } from '../../../src/utils/factory-management/products'
import { BuildingGroup, Factory, FactoryItem, ItemType } from '../../../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../../../src/utils/gameDataService'
import { mountItem, mountSatisfaction } from '../../helpers'
import { addBuildingGroup } from '../../../src/utils/factory-management/building-groups/common'

// @ts-ignore // this is fine, it works, stop moaning
const gameData = await fetchGameData()

const mountProduct = (factory: Factory) => {
  return mountItem(factory, Product)
}

const mountPowerProducer = (factory: Factory) => {
  return mountItem(factory, PowerProducer)
}

describe('TDD: BG-E-B-PROD: Building Groups: Editing Buildings (Products)', () => {
  let factory: Factory
  let product: FactoryItem
  let buildingGroup: BuildingGroup
  let subject: VueWrapper
  let satisfactionSubject: VueWrapper

  // Elements
  let addBuildingGroupButton: any
  let toggleSyncButton: any
  let buildingGroupCount: any
  let buildingGroupClock: any
  let itemBuildingCount: any
  let itemAmount: any
  let itemIngredientAmount: any
  let effectiveBuildings: any
  let buildingsRemaining: any

  beforeEach(async () => {
    factory = newFactory('BG-E-B-PROD Factory')
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
    satisfactionSubject = mountSatisfaction(factory)

    // Elements
    addBuildingGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
    toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
    buildingGroupCount = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
    buildingGroupClock = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
    itemBuildingCount = subject.find(`[id="${factory.id}-${product.id}-building-count"]`)
    itemAmount = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
    itemIngredientAmount = subject.find(`[id="${factory.id}-${product.id}-OreIron-amount"]`)
    effectiveBuildings = subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`)
    buildingsRemaining = subject.find(`[id="${factory.id}-${product.id}-remaining-buildings"]`)

    // Enable satisfaction breakdowns
    const satisfactionToggle = satisfactionSubject.find(`[id="${factory.id}-satisfaction-breakdown-toggle"]`)
    await satisfactionToggle.setValue(true)
  })

  test('BG-E-B-PROD-1: Allows editing of building count', async () => {
    expect(buildingGroupCount.element.value).toBe('2')

    await buildingGroupCount.setValue(3)

    expect(buildingGroupCount.element.value).toBe('3')
  })

  describe('Editing building count tests', () => {
    let groupIronIngots: any
    let groupOreIron: any
    let ironIngotsRemaining: any
    let oreIronRemaining: any

    beforeEach(async () => {
      await buildingGroupCount.setValue(3)

      groupIronIngots = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-IronIngot-amount"]`)
      groupOreIron = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-OreIron-amount"]`)
      ironIngotsRemaining = satisfactionSubject.find(`[id="${factory.id}-satisfaction-IronIngot-remaining"]`)
      oreIronRemaining = satisfactionSubject.find(`[id="${factory.id}-satisfaction-OreIron-remaining"]`)
    })

    test('BG-E-B-PROD-2: Editing building count updates the effective buildings', async () => {
      // Test beforeEach change
      expect(effectiveBuildings.text()).toBe('3.00')

      // Edit it again to ensure it updates consistently
      await buildingGroupCount.setValue(4)
      expect(effectiveBuildings.text()).toBe('4.00')
      // Reduce it back to 3
      await buildingGroupCount.setValue(3)
      expect(effectiveBuildings.text()).toBe('3.00')
    })

    test('BG-E-B-PROD-3: Editing building count updates the remaining buildings', async () => {
      // Test beforeEach change
      expect(buildingsRemaining.text()).toBe('0.00')

      // Turn off sync so we get a remainder
      await toggleSyncButton.trigger('click')
      expect(product.buildingGroupItemSync).toBe(false)

      // Edit it again to ensure it updates consistently
      await buildingGroupCount.setValue(4)
      expect(buildingsRemaining.text()).toBe('1.00') // Over | It's working via manual testing, just not here. Something to do with calculated values.
      // Reductions
      await buildingGroupCount.setValue(2)
      expect(buildingsRemaining.text()).toBe('1.00') // Short
    })

    test('BG-E-B-PROD-4: Editing building count updates the group part production', async () => {
      // Test beforeEach change
      expect(groupIronIngots.element.value).toBe('90')

      // Increases
      await buildingGroupCount.setValue(4)
      expect(groupIronIngots.element.value).toBe('120')
      expect(buildingGroup.parts.IronIngot).toBe(120)

      // Reductions
      await buildingGroupCount.setValue(2)
      expect(groupIronIngots.element.value).toBe('60')
      expect(buildingGroup.parts.IronIngot).toBe(60)
    })

    test('BG-E-B-PROD-5: Editing building count updates the group ingredient consumption', () => {
      // Test beforeEach change
      expect(groupOreIron.element.value).toBe('90')

      // Increases
      buildingGroupCount.setValue(4)
      expect(groupOreIron.element.value).toBe('120')
      expect(buildingGroup.parts.OreIron).toBe(120)

      // Reductions
      buildingGroupCount.setValue(2)
      expect(groupOreIron.element.value).toBe('60')
      expect(buildingGroup.parts.OreIron).toBe(60)
    })

    test("BG-E-B-PROD-6: Editing building count updates the item's part amount", async () => {
      // Test beforeEach change
      expect(itemAmount.element.value).toBe('90')

      // Edit it again to ensure it updates consistently
      await buildingGroupCount.setValue(4)
      expect(itemAmount.element.value).toBe('120')
      expect(product.amount).toBe(120)
      // Reduce it back to 3
      await buildingGroupCount.setValue(2)
      expect(itemAmount.element.value).toBe('60')
      expect(product.amount).toBe(60)

      // Wait a second to see if there's any dangling updates
      await new Promise(resolve => setTimeout(resolve, 1000))
      expect(itemAmount.element.value).toBe('60')
    })

    // TODO: Test not detecting the actual error properly
    test("BG-E-B-PROD-7: Editing building count updates the item's ingredient amount", async () => {
      // Test beforeEach change
      expect(itemIngredientAmount.element.value).toBe('90')

      // Increase
      await buildingGroupCount.setValue(4)
      expect(itemIngredientAmount.element.value).toBe('120')
      expect(product.requirements.OreIron.amount).toBe(120)

      // Reduce
      await buildingGroupCount.setValue(2)
      expect(itemIngredientAmount.element.value).toBe('60')
      expect(product.requirements.OreIron.amount).toBe(60)

      // Wait a second to see if there's any dangling updates
      await new Promise(resolve => setTimeout(resolve, 1000))
      expect(itemIngredientAmount.element.value).toBe('60')
    })

    // TODO: Test not detecting issue
    test('BG-E-B-PROD-8: Editing building count updates the factory parts produced', async () => {
      const ironIngotProduction = satisfactionSubject.find(`[id="${factory.id}-satisfaction-IronIngot-production"]`)

      // Test beforeEach change
      expect(itemAmount.element.value).toBe('90')

      // Increase
      await buildingGroupCount.setValue(4)
      expect(ironIngotsRemaining.text()).toBe('120')
      expect(factory.parts.IronIngot.amountSuppliedViaProduction).toBe(120)
      expect(ironIngotProduction.text()).toBe('+120/min')

      // Reduce
      await buildingGroupCount.setValue(2)
      expect(ironIngotsRemaining.text()).toBe('60')
      expect(factory.parts.IronIngot.amountSuppliedViaProduction).toBe(60)
      expect(ironIngotProduction.text()).toBe('+60/min')
    })

    test('BG-E-B-PROD-9: Editing building count updates the factory parts consumed', async () => {
      const oreIronRawSupply = satisfactionSubject.find(`[id="${factory.id}-satisfaction-OreIron-supply-raw"]`)
      const oreIronRequiredProduction = satisfactionSubject.find(`[id="${factory.id}-satisfaction-OreIron-required-production"]`)

      // Test beforeEach change
      expect(itemAmount.element.value).toBe('90')

      // Increase
      await buildingGroupCount.setValue(4)
      expect(oreIronRemaining.text()).toBe('0')
      expect(factory.parts.OreIron.amountSupplied).toBe(120)
      expect(oreIronRawSupply.text()).toBe('+120/min')
      expect(oreIronRequiredProduction.text()).toBe('-120/min')

      // Reduce
      await buildingGroupCount.setValue(2)
      expect(oreIronRemaining.text()).toBe('0')
      expect(factory.parts.OreIron.amountSupplied).toBe(60)
      expect(oreIronRawSupply.text()).toBe('+60/min')
      expect(oreIronRequiredProduction.text()).toBe('-60/min')
    })

    test('BG-E-B-PROD-10: Editing building count updates the group power used ', async () => {
      const groupPower = subject.find(`[id="${factory.id}-${buildingGroup.id}-buildings-group-power"]`)

      // Test beforeEach change
      expect(groupPower.text()).toBe('12 MW')

      // Increase
      await buildingGroupCount.setValue(4)
      expect(groupPower.text()).toBe('16 MW') // 4*4 MW

      // Reduce
      await buildingGroupCount.setValue(2)
      expect(groupPower.text()).toBe('8 MW') // 2*4 MW
    })

    test('BG-E-B-PROD-11: Editing building count updates the factory power used ', async () => {
      const factoryPower = satisfactionSubject.find(`[id="${factory.id}-buildings-power-consumed"]`)

      // Test beforeEach change
      expect(factoryPower.text()).toBe('12 MW')

      // Increase
      await buildingGroupCount.setValue(4)
      expect(factoryPower.text()).toBe('16 MW') // 4*4 MW

      // Reduce
      await buildingGroupCount.setValue(2)
      expect(factoryPower.text()).toBe('8 MW') // 2*4 MW
    })

    test('BG-E-B-PROD-12: Editing building count updates the factory total buildings', async () => {
      const factoryBuildings = satisfactionSubject.find(`[id="${factory.id}-buildings-building-smeltermk1"]`)

      // Test beforeEach change
      expect(factoryBuildings.text()).toBe('3')

      // Increase
      await buildingGroupCount.setValue(4)
      expect(factoryBuildings.text()).toBe('4')

      // Reduce
      await buildingGroupCount.setValue(2)
      expect(factoryBuildings.text()).toBe('2')
    })

    describe('multiple building groups', () => {
      let buildingGroup2: BuildingGroup
      let buildingGroup2Count: any

      // Clocks
      let buildingGroupClock: any
      let buildingGroup2Clock: any

      beforeEach(() => {
        addBuildingGroup(product, ItemType.Product, factory)
        buildingGroup2 = product.buildingGroups[1]

        // Remount the product as the DOM has changed
        subject.unmount()
        subject = mountProduct(factory)

        // Elements
        buildingGroupCount = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
        buildingGroup2Count = subject.find(`[id="${factory.id}-${buildingGroup2.id}-building-count"]`)
        buildingGroupClock = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
        buildingGroup2Clock = subject.find(`[id="${factory.id}-${buildingGroup2.id}-clock"]`)
      })

      test('it should have set up the tests correctly', () => {
        expect(buildingGroupCount.element.value).toBe('3')
        expect(buildingGroup2Count.element.value).toBe('0')
      })

      test('BG-E-B-PROD-13: Multi Group: Editing group building count does NOT rebalance the building groups', async () => {
        // The end result we expect here is that the building groups will not be force rebalanced.
        // Despite sync setting, the item will be updated to match the user's input plus any other group counts.
        // No overclocks should be changed.

        // Simulate a user editing the building count for the second group
        await buildingGroup2Count.setValue(4)

        // Counts should be as expected
        expect(buildingGroupCount.element.value).toBe('3')
        expect(buildingGroup2Count.element.value).toBe('4')

        // Clocks should not have been altered
        expect(buildingGroupClock.element.value).toBe('100')
        expect(buildingGroup2Clock.element.value).toBe('100')

        // The item should be 3+4 = 7 as expected with Sync being enabled
        expect(itemBuildingCount.element.value).toBe('7')
      })
    })
  })
})
