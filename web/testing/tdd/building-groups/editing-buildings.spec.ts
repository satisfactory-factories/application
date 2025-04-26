import { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import PowerProducer from '../../../src/components/planner/products/PowerProducer.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addProductToFactory } from '../../../src/utils/factory-management/products'
import { BuildingGroup, Factory, FactoryItem } from '../../../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../../../src/utils/gameDataService'
import { mountItem, mountSatisfaction } from '../../helpers'

// @ts-ignore // this is fine, it works, stop moaning
const gameData = await fetchGameData()

const mountProduct = (factory: Factory) => {
  return mountItem(factory, Product)
}

const mountPowerProducer = (factory: Factory) => {
  return mountItem(factory, PowerProducer)
}

describe('TDD: Building Groups: Editing Buildings (Products)', () => {
  let factory: Factory
  let product: FactoryItem
  let buildingGroup: BuildingGroup
  let subject: VueWrapper
  let satisfactionSubject: VueWrapper

  // Elements
  let addBuildingGroupButton: any
  let toggleSyncButton: any
  let buildingGroupCount: any
  let itemAmount: any
  let itemIngredientAmount: any
  let effectiveBuildings: any
  let buildingsRemaining: any

  let groupIronIngots: any
  let groupOreIron: any

  beforeEach(async () => {
    factory = newFactory('BG-E-B-PROD Factory')
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 90, // 3 Buildings
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
    itemAmount = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
    itemIngredientAmount = subject.find(`[id="${factory.id}-${product.id}-OreIron-amount"]`)
    effectiveBuildings = subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`)
    buildingsRemaining = subject.find(`[id="${factory.id}-${product.id}-remaining-buildings"]`)

    groupIronIngots = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-IronIngot-amount"]`)
    groupOreIron = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-OreIron-amount"]`)

    // Enable satisfaction breakdowns
    const satisfactionToggle = satisfactionSubject.find(`[id="${factory.id}-satisfaction-breakdown-toggle"]`)
    await satisfactionToggle.setValue(true)

    // Set up the building group defaults
    await buildingGroupCount.setValue(3)
  })

  describe('BG-E-B-PROD: Building Groups Editing - Buildings single group (Products)', () => {
    let ironIngotsRemaining: any
    let oreIronRemaining: any

    beforeEach(async () => {
      ironIngotsRemaining = satisfactionSubject.find(`[id="${factory.id}-satisfaction-IronIngot-remaining"]`)
      oreIronRemaining = satisfactionSubject.find(`[id="${factory.id}-satisfaction-OreIron-remaining"]`)
    })

    test('BG-E-B-PROD-1: Allows editing of building count', async () => {
      expect(buildingGroupCount.element.value).toBe('3')

      await buildingGroupCount.setValue(4)

      expect(buildingGroupCount.element.value).toBe('4')
    })

    test('BG-E-B-PROD-2: Editing building count updates the effective buildings', async () => {
      // Assert the before
      expect(effectiveBuildings.text()).toBe('3.00')

      // Edit it again to ensure it updates consistently
      await buildingGroupCount.setValue(4)
      expect(effectiveBuildings.text()).toBe('4.00')
      // Reduce it back to 3
      await buildingGroupCount.setValue(3)
      expect(effectiveBuildings.text()).toBe('3.00')
    })

    test('BG-E-B-PROD-3: Editing building count updates the remaining buildings', async () => {
      // Assert the before
      expect(buildingsRemaining.text()).toBe('0.00')

      // Turn off sync so we can produce a remainder
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
      // Assert the before
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
      const groupPower = subject.find(`[id="${factory.id}-${buildingGroup.id}-group-power"]`)

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
  })

  describe('BG-E-BMULTI-PROD: Building Groups Editing - Buildings multiple groups (Products)', () => {
    let buildingGroup2: BuildingGroup
    let buildingGroup2Count: any

    // Clocks
    let buildingGroupClock: any
    let buildingGroup2Clock: any
    let itemBuildingCount: any

    beforeEach(async () => {
      await addBuildingGroupButton.trigger('click')
      buildingGroup2 = product.buildingGroups[1]
      // Enable sync again
      product.buildingGroupItemSync = true

      // Remount the product as the DOM has changed
      subject.unmount()
      subject = mountProduct(factory)

      // Elements
      buildingGroupCount = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
      buildingGroup2Count = subject.find(`[id="${factory.id}-${buildingGroup2.id}-building-count"]`)
      buildingGroupClock = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
      buildingGroup2Clock = subject.find(`[id="${factory.id}-${buildingGroup2.id}-clock"]`)
      itemBuildingCount = subject.find(`[id="${factory.id}-${product.id}-building-count"]`)
      itemIngredientAmount = subject.find(`[id="${factory.id}-${product.id}-OreIron-amount"]`)
      groupOreIron = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-OreIron-amount"]`)

      // Assert sync is enabled
      expect(product.buildingGroupItemSync).toBe(true)
    })

    test('it should have set up the tests correctly', () => {
      expect(buildingGroupCount.element.value).toBe('3')
      expect(buildingGroup2Count.element.value).toBe('0')
    })

    describe('Sync on', () => {
      beforeEach(async () => {
        // Assert sync is enabled
        expect(product.buildingGroupItemSync).toBe(true)
      })

      test('BG-E-BMULTI-PROD-1: Editing group building count does not trigger a rebalance and matches user input', async () => {
      // The result we expect here is that the building groups will not be force rebalanced.
      // Despite the sync setting, the item will be updated to match the user's input plus any other group counts.

        // Simulate a user editing the building count for the second group
        await buildingGroup2Count.setValue(4)

        expect(buildingGroupCount.element.value).toBe('3')
        expect(buildingGroup2Count.element.value).toBe('4')

        // Do the same but with bigger numbers and on the first group
        await buildingGroupCount.setValue(41)

        expect(buildingGroupCount.element.value).toBe('41')
        expect(buildingGroup2Count.element.value).toBe('4')
      })

      test('BG-E-BMULTI-PROD-2: Editing group building count does not affect clocks', async () => {
      // No overclocks should be changed under either sync condition.

        // Simulate a user editing the building count for the second group
        await buildingGroup2Count.setValue(4)

        // Clocks should not have been altered
        expect(buildingGroupClock.element.value).toBe('100')
        expect(buildingGroup2Clock.element.value).toBe('100')
      })

      test("BG-E-BMULTI-PROD-3: Editing group building count updates the item's building counts", async () => {
        await buildingGroup2Count.setValue(41)

        // Item building counts should be the sum of the building groups
        expect(itemBuildingCount.element.value).toBe('44') // 41+3
      })

      test("BG-E-BMULTI-PROD-3.1: Editing group building count updates the item's ingredients", async () => {
        // Simulate a user editing the building count for the second group
        await buildingGroup2Count.setValue(41)

        // Item ingredients should match expected
        expect(itemIngredientAmount.element.value).toBe('1320') // 44*30
      })

      test('BG-E-BMULTI-PROD-4: Editing building count updates the group ingredients correctly', async () => {
        const group2IronIngots: any = subject.find(`[id="${factory.id}-${buildingGroup2.id}-parts-IronIngot-amount"]`)
        const group2OreIron: any = subject.find(`[id="${factory.id}-${buildingGroup2.id}-parts-OreIron-amount"]`)
        // In all cases the building counts should update the ingredients properly

        // Simulate a user editing the building count for the second group
        await buildingGroup2Count.setValue(42)

        // Item building counts should be the sum of the building groups
        expect(groupIronIngots.element.value).toBe('90') // 30*3
        expect(groupOreIron.element.value).toBe('90') // 30*3
        expect(group2IronIngots.element.value).toBe('1260') // 30*42
        expect(group2OreIron.element.value).toBe('1260') // 30*42
      })

      test("BG-E-BMULTI-PROD-5: Effective buildings equally match the item's total buildings", async () => {
        // Simulate a user editing the building count for the second group
        await buildingGroup2Count.setValue(123)

        // Assert that the effective buildings are equal to the item building count
        expect(effectiveBuildings.element.value).toBe('126') // TODO: Component calculation issues
        expect(itemBuildingCount.element.value).toBe('126')
      })

      test("BG-E-BMULTI-PROD-6: Effective buildings equally match the item's total buildings", async () => {
        // Simulate a user editing the building count for the second group
        await buildingGroup2Count.setValue(123)

        // Assert that the effective buildings are equal to the item building count
        expect(buildingsRemaining.element.value).toBe('0') // TODO: Component calculation issues
      })

      test('BG-E-BMULTI-PROD-7: Remainder error state should be indicated to the user', async () => {
        const buildingStatus = subject.find(`[id="${factory.id}-${product.id}-buildings-status-indicator"]`)
        // Turn off sync so we can manipulate the remainder
        await toggleSyncButton.trigger('click')
        expect(product.buildingGroupItemSync).toBe(false)

        // Simulate a user editing the building count for the second group
        await buildingGroup2Count.setValue(50)
        await buildingGroupCount.setValue(50)
        await itemBuildingCount.setValue(40)

        // Buildings should now be over by 10, and should be red indicator, and the remainder should be showing
        expect(buildingStatus.attributes().isred).toBe('true') // TODO: Component calculation issue
        expect(buildingsRemaining.element.value).toBe('10') // TODO: Component calculation issue
      })

      test('BG-E-BMULTI-PROD-8: Updating via the item SHOULD force a rebalance of group building counts ', async () => {
        // First disable sync
        await toggleSyncButton.trigger('click')
        expect(product.buildingGroupItemSync).toBe(false)

        // Change the building groups to not be balanced
        await buildingGroupCount.setValue(10)
        await buildingGroup2Count.setValue(20)

        // Turn sync back on
        await toggleSyncButton.trigger('click')
        expect(product.buildingGroupItemSync).toBe(true)

        // Change the item's building count, this should force a rebalance
        await itemBuildingCount.setValue(30)
        expect(buildingGroupCount.element.value).toBe('15')
        expect(buildingGroup2Count.element.value).toBe('15')
      })
    })

    describe('Sync off', () => {
      beforeEach(async () => {
        // Assert sync is disabled
        await toggleSyncButton.trigger('click')
        expect(product.buildingGroupItemSync).toBe(false)
      })

      test("BG-E-BMULTI-PROD-9: Editing groups does NOT affect the item's total buildings", async () => {
        // Check the expected item building count before
        expect(itemBuildingCount.element.value).toBe('3')

        // Change one of the building groups, this should NOT update the item
        await buildingGroupCount.setValue(123)
        expect(itemBuildingCount.element.value).toBe('3')
      })

      test('BG-E-BMULTI-PROD-10: Editing groups does NOT trigger a rebalance', async () => {
        // Balance the groups
        await buildingGroupCount.setValue(123)
        await buildingGroup2Count.setValue(123)

        // Now unbalance them
        await buildingGroupCount.setValue(1)

        // Assert that the groups are not rebalanced
        expect(buildingGroupCount.element.value).toBe('1')
        expect(buildingGroup2Count.element.value).toBe('123')
      })

      test("BG-E-BMULTI-PROD-11: Editing item's buildings does NOT affect the groups's buildings", async () => {
        // Check the group counts before
        expect(buildingGroupCount.element.value).toBe('3')
        expect(buildingGroup2Count.element.value).toBe('0')

        // Change the item building count, this should NOT update the groups
        await itemBuildingCount.setValue(123)
        expect(buildingGroupCount.element.value).toBe('3')
        expect(buildingGroup2Count.element.value).toBe('0')
      })

      test('BG-E-BMULTI-PROD-12: Editing groups does NOT affect factory parts', async () => {
        // Check the item's parts before
        expect(itemIngredientAmount.element.value).toBe('90') // OreIron

        // Change one of the building groups, this should NOT update the item
        await buildingGroupCount.setValue(123)
        expect(itemIngredientAmount.element.value).toBe('90')
      })

      test('BG-E-BMULTI-PROD-13: Effective and remaining buildings correctly calculated', async () => {
        const itemBuildingStatus = subject.find(`[id="${factory.id}-${product.id}-buildings-status-indicator"]`)
        // Check the expected item building count before
        expect(itemBuildingCount.element.value).toBe('3')

        // Change one of the building groups, this should NOT update the item
        await buildingGroupCount.setValue(123)
        expect(itemBuildingCount.element.value).toBe('3')
        expect(effectiveBuildings.element.value).toBe('3') // Should match the building groups count
        expect(buildingsRemaining.element.value).toBe('120') // 123-3
        expect(itemBuildingStatus.attributes().isred).toBe('true') // TODO: Component calculation issue

        // Change the 2nd group
        await buildingGroup2Count.setValue(10)
        expect(itemBuildingCount.element.value).toBe('3')
        expect(effectiveBuildings.element.value).toBe('13') // Should match both building groups count
        expect(buildingsRemaining.element.value).toBe('110') // 123-13
        expect(itemBuildingStatus.attributes().isred).toBe('true') // TODO: Component calculation issue
      })
    })
  })
})
