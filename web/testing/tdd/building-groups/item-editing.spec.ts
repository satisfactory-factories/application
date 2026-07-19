import { VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '../../../src/components/planner/products/Product.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addProductToFactory } from '../../../src/utils/factory-management/products'
import { BuildingGroup, Factory, FactoryItem } from '../../../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../../../src/utils/gameDataService'
import { mountItem } from '../../helpers'

// @ts-ignore // this is fine, it works, stop moaning
const gameData = await fetchGameData()

const mountProduct = (factory: Factory) => {
  return mountItem(factory, Product)
}

describe('TDD: BG-I-E-PROD: Item Editing', () => {
  let factory: Factory
  let product: FactoryItem
  let buildingGroup: BuildingGroup
  let subject: VueWrapper

  // Elements
  let addBuildingGroupButton: any

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

  describe('Editing recipe', () => {
    test('BG-I-E-PROD-2: Editing the product recipe recreates the building group @ 1 building', async () => {
      product.buildingGroupItemSync = true
      // Before: IngotIron makes 30/min, so 60/min needs 2 buildings.
      expect(product.buildingGroups.length).toBe(1)
      expect(product.buildingGroups[0].buildingCount).toBe(2)

      // The second VAutocomplete is the recipe selector.
      const recipeAuto = subject.findAllComponents({ name: 'VAutocomplete' })[1]
      // Alternate_IronIngot_Leached makes 100/min, so 60/min => 0.6 buildings => 1 underclocked building.
      recipeAuto.vm.$emit('update:modelValue', 'Alternate_IronIngot_Leached')

      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(product.recipe).toBe('Alternate_IronIngot_Leached')
      // A single group is recreated, and it holds exactly one (underclocked) building.
      expect(product.buildingGroups.length).toBe(1)
      expect(product.buildingGroups[0].buildingCount).toBe(1)
      // The recreated group is consistent with the item, so no imbalance is flagged.
      expect(product.buildingGroupsHaveProblem).toBe(false)
    })
  })

  describe('Debounce', () => {
    test('BG-I-E-PROD-3: Editing the product quantity has a debounce', async () => {
      product.buildingGroupItemSync = true
      expect(buildingGroup.buildingCount).toBe(2)

      const itemAmountInput = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
      await itemAmountInput.setValue(120) // 4 buildings once applied

      // Before the debounce elapses, the building group must NOT have updated yet.
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(product.buildingGroups[0].buildingCount).toBe(2)

      // After the debounce elapses, the change is applied.
      await new Promise(resolve => setTimeout(resolve, 1000))
      expect(product.buildingGroups[0].buildingCount).toBe(4)
    })
  })

  describe('Byproduct and ingredient changes', () => {
    // This recipe produces HeavyOilResidue:40 with a PolymerResin:20 byproduct and a LiquidOil:30 ingredient.
    beforeEach(() => {
      factory = newFactory('BG-I-E-PROD Byproduct Factory')
      addProductToFactory(factory, {
        id: 'HeavyOilResidue',
        amount: 40, // 1 building
        recipe: 'Alternate_HeavyOilResidue',
      })
      product = reactive(factory.products[0])
      product.buildingGroupsTrayOpen = true
      buildingGroup = product.buildingGroups[0]
      calculateFactories([factory], gameData)
      subject = mountProduct(factory)

      addBuildingGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
    })

    const byProductInput = () => subject.find(`input[name="${product.id}.byProducts.${product.byProducts![0].id}"]`)
    const ingredientInput = (part: string) => subject.find(`[id="${factory.id}-${product.id}-${part}-amount"]`)

    describe('Sync on', () => {
      beforeEach(() => {
        product.buildingGroupItemSync = true
      })

      describe('Single group', () => {
        beforeEach(() => {
          expect(buildingGroup.buildingCount).toBe(1)
        })

        test('BG-I-E-PROD-9: Changing the product byproducts changes the building group building count', async () => {
          // Doubling the byproduct (20 -> 40) doubles the product amount, needing 2 buildings.
          await byProductInput().setValue(40)
          await new Promise(resolve => setTimeout(resolve, 1000))

          expect(product.amount).toBe(80)
          expect(product.buildingGroups[0].buildingCount).toBe(2)
        })

        test('BG-I-E-PROD-10: Changing the product ingredient changes the building group building count', async () => {
          // Doubling the ingredient (30 -> 60) doubles the product amount, needing 2 buildings.
          await ingredientInput('LiquidOil').setValue(60)
          await new Promise(resolve => setTimeout(resolve, 1000))

          expect(product.amount).toBe(80)
          expect(product.buildingGroups[0].buildingCount).toBe(2)
        })
      })

      describe('Multiple groups', () => {
        beforeEach(async () => {
          await addBuildingGroupButton.trigger('click')
          expect(product.buildingGroups.length).toBe(2)
          // Adding a group disables sync, turn it back on to force rebalancing.
          product.buildingGroupItemSync = true
        })

        test('BG-I-E-PROD-13: Changing the product byproducts triggers a rebalance', async () => {
          // Byproduct 20 -> 80 quadruples the product amount to 160/min => 4 buildings split evenly.
          await byProductInput().setValue(80)
          await new Promise(resolve => setTimeout(resolve, 1000))

          expect(product.amount).toBe(160)
          expect(product.buildingGroups[0].buildingCount).toBe(2)
          expect(product.buildingGroups[1].buildingCount).toBe(2)
        })

        test('BG-I-E-PROD-14: Changing the product ingredient triggers a rebalance', async () => {
          // Ingredient 30 -> 120 quadruples the product amount to 160/min => 4 buildings split evenly.
          await ingredientInput('LiquidOil').setValue(120)
          await new Promise(resolve => setTimeout(resolve, 1000))

          expect(product.amount).toBe(160)
          expect(product.buildingGroups[0].buildingCount).toBe(2)
          expect(product.buildingGroups[1].buildingCount).toBe(2)
        })
      })
    })

    describe('Sync off', () => {
      beforeEach(() => {
        product.buildingGroupItemSync = false
      })

      test('BG-I-E-PROD-16: Changing the product byproducts does NOT rebalance the building groups', async () => {
        const snapshot = product.buildingGroups.map(group => ({
          buildingCount: group.buildingCount,
          overclockPercent: group.overclockPercent,
        }))

        await byProductInput().setValue(40)
        await new Promise(resolve => setTimeout(resolve, 1000))

        product.buildingGroups.forEach((group, index) => {
          expect(group.buildingCount).toBe(snapshot[index].buildingCount)
          expect(group.overclockPercent).toBe(snapshot[index].overclockPercent)
        })
      })

      test('BG-I-E-PROD-17: Changing the product ingredient does NOT rebalance the building groups', async () => {
        const snapshot = product.buildingGroups.map(group => ({
          buildingCount: group.buildingCount,
          overclockPercent: group.overclockPercent,
        }))

        await ingredientInput('LiquidOil').setValue(60)
        await new Promise(resolve => setTimeout(resolve, 1000))

        product.buildingGroups.forEach((group, index) => {
          expect(group.buildingCount).toBe(snapshot[index].buildingCount)
          expect(group.overclockPercent).toBe(snapshot[index].overclockPercent)
        })
      })
    })
  })

  describe('Sync off readouts', () => {
    beforeEach(() => {
      product.buildingGroupItemSync = false
    })

    const effectiveReadout = () => subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`)
    const remainingReadout = () => subject.find(`[id="${factory.id}-${product.id}-remaining-buildings"]`)
    const statusReadout = () => subject.find(`[id="${factory.id}-${product.id}-buildings-status"]`)

    test('BG-I-E-PROD-18: Changing the product updates the effective buildings readout', async () => {
      // Groups stay at 2 buildings when sync is off, so effective buildings must remain 2.00.
      expect(effectiveReadout().text()).toContain('2.00')

      const itemAmountInput = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
      await itemAmountInput.setValue(120) // Item now wants 4 buildings, groups unchanged.
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(effectiveReadout().text()).toContain('2.00')
    })

    test('BG-I-E-PROD-19: Changing the product updates the remaining buildings readout', async () => {
      // Balanced to start: 0 remaining.
      expect(remainingReadout().text()).toContain('0.00')

      const itemAmountInput = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
      await itemAmountInput.setValue(120) // 4 wanted - 2 effective => 2 short.
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(remainingReadout().text()).toContain('2.00')
    })

    test('BG-I-E-PROD-20: Changing the product updates the status colours', async () => {
      // Balanced to start: green status.
      expect(statusReadout().classes()).toContain('text-green')

      const itemAmountInput = subject.find(`[id="${factory.id}-${product.id}-amount"]`)
      await itemAmountInput.setValue(120) // Now under producing.
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(statusReadout().classes()).toContain('text-red')
      expect(subject.text()).toContain('Under producing!')
    })
  })
})
