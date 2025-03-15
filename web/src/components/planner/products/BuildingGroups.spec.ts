import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import Product from './Product.vue'
import PowerProducer from './PowerProducer.vue'
import { calculateFactories, calculateFactory, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import {
  BuildingGroup,
  Factory,
  FactoryItem,
  FactoryPowerChangeType,
  FactoryPowerProducer,
} from '@/interfaces/planner/FactoryInterface'
import { fetchGameData } from '@/utils/gameDataService'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { formatPower } from '@/utils/numberFormatter'

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
        updateFactory: (factory: any) => {
          calculateFactory(factory, [factory], gameData)
        },
        updateOrder: (factory: any) => {
          return 'foo'
        },
      },
    },
  })
}

describe('Component: BuildingGroups', () => {
  let factory: Factory
  let subject: VueWrapper<{factory: Factory }>
  let buildingGroup: BuildingGroup

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = newFactory('Testing building groups')
  })

  describe('product', () => {
    let product: FactoryItem
    let addGroupButton: any

    beforeEach(() => {
      addProductToFactory(factory, {
        id: 'IronIngot',
        amount: 30, // 1 building
        recipe: 'IngotIron',
      })
      product = factory.products[0]
      product.buildingGroupsTrayOpen = true // This is needed otherwise nothing renders
      buildingGroup = product.buildingGroups[0]

      // This also adds the first building group
      calculateFactories([factory], gameData)
      subject = mountProduct(factory)

      addGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
    })

    describe('adding 2nd group', () => {
      let newBuildingGroup: BuildingGroup
      let oreIronAmount: any
      let ironIngotAmount: any

      beforeEach(async () => {
        // Adds a new group
        await addGroupButton.trigger('click')

        // Get the ID of the new building group
        newBuildingGroup = product.buildingGroups[1]

        oreIronAmount = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-OreIron-amount"]`)
        ironIngotAmount = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-IronIngot-amount"]`)
      })

      it('should add a new building group of 0 buildings', async () => {
        const count = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-building-count"]`)
        expect(count.attributes('value')).toBe('0')
      })

      it('should add a 2nd group with zeroed metrics', async () => {
        oreIronAmount = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-parts-OreIron-amount"]`)
        ironIngotAmount = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-parts-IronIngot-amount"]`)
        expect(oreIronAmount.attributes('value')).toBe('0')
        expect(ironIngotAmount.attributes('value')).toBe('0')
      })

      it('should add a new group with 100% clock', async () => {
        const buildingGroupClock = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-clock"]`)
        expect(buildingGroupClock.attributes('value')).toBe('100')
      })

      it('should not display power production for products', () => {
        const buildingGroupPower = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-power"]`)
        expect(buildingGroupPower.exists()).toBe(false)
      })
    })

    describe('editing groups', () => {
      let buildingGroupCount: any
      let buildingGroupClock: any
      let buildingGroupPowerUsed: any

      beforeEach(() => {
        buildingGroupCount = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
        buildingGroupClock = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
        buildingGroupPowerUsed = subject.find(`[id="${factory.id}-${buildingGroup.id}-power"]`)
      })

      it('should correctly update the building group when building count has changed', async () => {
        await buildingGroupCount.setValue('2')

        expect(buildingGroup.buildingCount).toBe(2)
        expect(buildingGroup.overclockPercent).toBe(100)
        expect(buildingGroup.parts.OreIron).toBe(60)
        expect(buildingGroup.parts.IronIngot).toBe(60)
      })

      it('should update the product building count when there is a singular group', async () => {
        await buildingGroupCount.setValue('2')

        expect(product.buildingRequirements.amount).toBe(2)
      })

      it('should NOT update the product building count when there are multiple groups', async () => {
        // Add a new group
        await addGroupButton.trigger('click')
        const newBuildingGroup = product.buildingGroups[1]

        const count = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-building-count"]`)
        await count.setValue('3')

        expect(product.buildingRequirements.amount).toBe(1) // Originally 1
      })

      it('should the clock be changed, the parts should update', async () => {
        const oreIronAmount = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-OreIron-amount"]`)
        const ironIngotAmount = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-IronIngot-amount"]`)

        await buildingGroupClock.setValue('200')
        // We have baked in a debounce delay of 750ms, so make the test wait
        await new Promise(resolve => setTimeout(resolve, 1000))
        expect(buildingGroup.overclockPercent).toBe(200)
        expect(buildingGroup.parts.OreIron).toBe(60)
        expect(oreIronAmount.attributes('value')).toBe('60')
        expect(buildingGroup.parts.IronIngot).toBe(60)
        expect(ironIngotAmount.attributes('value')).toBe('60')

        // TODO: Resolve rounding issue
        await buildingGroupClock.setValue('133.3333')
        await new Promise(resolve => setTimeout(resolve, 1000)) // Debounce
        expect(buildingGroup.overclockPercent).toBe(133.3333)
        expect(buildingGroup.parts.OreIron).toBe(39.999)
        expect(buildingGroup.parts.IronIngot).toBe(39.999)

        await buildingGroupClock.setValue('50')
        await new Promise(resolve => setTimeout(resolve, 1000)) // Debounce
        expect(buildingGroup.buildingCount).toBe(1)
        expect(buildingGroup.overclockPercent).toBe(50)
        expect(buildingGroup.parts.OreIron).toBe(15)
        expect(buildingGroup.parts.IronIngot).toBe(15)
      })

      it('should the clock be changed, the group\'s power should update', async () => {
        // Product originally starts off at 30 iron ingots.

        // At 100%, we should be using 4MW
        expect(buildingGroupPowerUsed.text()).toBe('4 MW')

        await buildingGroupClock.setValue('200')
        // We have baked in a debounce delay of 750ms, so make the test wait
        await new Promise(resolve => setTimeout(resolve, 1000))
        expect(buildingGroupPowerUsed.text()).toBe('10 MW') // Remember Power is not a linear calculation.
      })

      it('should the clock be changed, the group\'s underchips should be correct', async () => {
        // Product originally starts off at 30 iron ingots.
        const chipOreIron = subject.find(`[id="${factory.id}-${buildingGroup.id}-underchip-OreIron"]`)
        const chipIronIngot = subject.find(`[id="${factory.id}-${buildingGroup.id}-underchip-IronIngot"]`)

        // At 100%, we should be using 30/30
        expect(chipOreIron.text()).toBe('30 / building')
        expect(chipIronIngot.text()).toBe('30 / building')

        await buildingGroupClock.setValue('200')
        // We have baked in a debounce delay of 750ms, so make the test wait
        await new Promise(resolve => setTimeout(resolve, 1000))

        expect(chipOreIron.text()).toBe('60 / building')
        expect(chipIronIngot.text()).toBe('60 / building')

        await buildingGroupClock.setValue('55')
        await new Promise(resolve => setTimeout(resolve, 1000)) // Debounce

        expect(chipOreIron.text()).toBe('16.5 / building')
        expect(chipIronIngot.text()).toBe('16.5 / building')

        // TODO: Resolve rounding issue
        // await clock.setValue('133.3333')
        // await new Promise(resolve => setTimeout(resolve, 1000)) // Debounce
        //
        // expect(chipOreIron.text()).toBe('39.999 / building')
        // expect(chipIronIngot.text()).toBe('39.999 / building')
      })

      it('should the building count be changed, the group\'s underchips should be correct', async () => {
        // Product originally starts off at 30 iron ingots.
        const chipOreIron = subject.find(`[id="${factory.id}-${buildingGroup.id}-underchip-OreIron"]`)
        const chipIronIngot = subject.find(`[id="${factory.id}-${buildingGroup.id}-underchip-IronIngot"]`)

        // At 1 building @100%, we should be using 30/30
        expect(chipOreIron.text()).toBe('30 / building')
        expect(chipIronIngot.text()).toBe('30 / building')

        await buildingGroupCount.setValue('10')
        // We have baked in a debounce delay of 750ms, so make the test wait
        await new Promise(resolve => setTimeout(resolve, 1000))

        // The per building counts stay the same as the overclock is 100%
        expect(chipOreIron.text()).toBe('30 / building')
        expect(chipIronIngot.text()).toBe('30 / building')
      })

      describe('group<->product sync', () => {
        let productBuildingCount: any

        beforeEach(() => {
          product.buildingGroupItemSync = true
          productBuildingCount = subject.find(`[id="${factory.id}-${product.id}-building-count"]`)
        })

        it('should be enabled by default', () => {
          const toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)

          expect(product.buildingGroupItemSync).toBe(true)
          expect(toggleSyncButton.text()).toBe('Enabled')
        })

        describe('enabled', () => {
          it('should enable the sync when reduced to a single group', async () => {
          // Add a new group
            await addGroupButton.trigger('click')
            const deleteButton = subject.find(`[id="${factory.id}-${buildingGroup.id}-delete-building-group"]`)
            await deleteButton.trigger('click')

            const toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)

            expect(product.buildingGroupItemSync).toBe(true)
            expect(toggleSyncButton.text()).toBe('Enabled')
          })

          it('should sync be enabled, and a singular group, when product is edited group should be kept in sync', async () => {
            await productBuildingCount.setValue('2')

            expect(product.buildingRequirements.amount).toBe(2)
            expect(product.buildingGroups[0].buildingCount).toBe(2)
            expect(buildingGroupCount.attributes('value')).toBe('2')
          })

          it('should sync be enabled, and a singular group, when building group is edited product should be kept in sync', async () => {
            await buildingGroupCount.setValue('2')

            expect(productBuildingCount.value).toBe('2')
            expect(product.buildingRequirements.amount).toBe(2)
          })

          it('should update the product when enabled and the building count is changed (single group)', async () => {
            const count = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
            await count.setValue('2')

            const productBuildingCount = subject.find(`[id="${factory.id}-${product.id}-building-count"]`)
            expect(productBuildingCount.attributes('value')).toBe('2')
          })

          it('should update the product when enabled and the building count is changed (multi-group)', async () => {
            // Add another group
            const addGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
            await addGroupButton.trigger('click')

            // Set new group's building counts to 10
            const newGroupCount = subject.find(`[id="${factory.id}-${product.buildingGroups[1].id}-building-count"]`)
            await newGroupCount.setValue('10')
            expect(product.buildingGroups[1].buildingCount).toBe(10)

            // Set original building count to 2, totalling to 12
            const count = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
            await count.setValue('2')

            const productBuildingCount = subject.find(`[id="${factory.id}-${product.id}-building-count"]`)
            expect(productBuildingCount.attributes('value')).toBe('12')
            expect(product.buildingRequirements.amount).toBe(12)
          })
        })

        describe('disabled', () => {
          it('should disable the sync when a second group is added', async () => {
          // Add a new group
            await addGroupButton.trigger('click')
            const toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)

            expect(product.buildingGroupItemSync).toBe(false)
            expect(toggleSyncButton.text()).toBe('Disabled')
          })

          it('should sync be disabled, and a singular group, when product is edited group should NOT be kept in sync', async () => {
            await productBuildingCount.setValue('2')

            expect(product.buildingRequirements.amount).toBe(2)
            expect(product.buildingGroups[0].buildingCount).toBe(1)
            expect(buildingGroupCount.attributes('value')).toBe('1')
          })

          it('should sync be disabled, and a singular group, when building group is edited product should NOT be kept in sync', async () => {
            await buildingGroupCount.setValue('2')

            expect(productBuildingCount.value).toBe('1')
            expect(product.buildingRequirements.amount).toBe(1)
          })
        })
      })
    })

    describe('deleting groups', () => {
      beforeEach(async () => {
        // Add a new group
        await addGroupButton.trigger('click')
      })

      it('should remove the building group correctly', async () => {
        const expectedGroupId = product.buildingGroups[1].id
        const expectedGroupBuildingCount = subject.find(`[id="${factory.id}-${expectedGroupId}-building-count"]`)
        const deleteButton = subject.find(`[id="${factory.id}-${buildingGroup.id}-delete-building-group"]`)

        await deleteButton.trigger('click')

        expect(product.buildingGroups.length).toBe(1)
        expect(product.buildingGroups[0].id).toBe(expectedGroupId)
        expect(expectedGroupBuildingCount.exists()).toBe(true)
      })

      it('should show correct sync status when deleting the 2nd to last remaining group', async () => {
        // Add another group
        await addGroupButton.trigger('click')

        // Get the 2nd and 3rd group IDs and trigger their delete buttons
        const secondGroupId = product.buildingGroups[1].id
        const thirdGroupId = product.buildingGroups[2].id

        const secondGroupDeleteButton = subject.find(`[id="${factory.id}-${secondGroupId}-delete-building-group"]`)
        const thirdGroupDeleteButton = subject.find(`[id="${factory.id}-${thirdGroupId}-delete-building-group"]`)

        await secondGroupDeleteButton.trigger('click')
        await thirdGroupDeleteButton.trigger('click')

        const toggleSyncButton = subject.find(`[id="${factory.id}-${product.id}-toggle-sync"]`)
        expect(toggleSyncButton.text()).toBe('Enabled')
        expect(product.buildingGroupItemSync).toBe(true)
      })
    })

    describe('spot checks', () => {
      it('should display distilled silica which has an input that is also and byproduct (water)', () => {
        addProductToFactory(factory, {
          id: 'Silica',
          amount: 27,
          recipe: 'Alternate_Silica_Distilled',
        })
        product = factory.products[1]
        product.buildingGroupsTrayOpen = true
        buildingGroup = product.buildingGroups[0]
        calculateFactories([factory], gameData)
        subject = mountProduct(factory)

        const waterInput = subject.find(`[id="${factory.id}-${buildingGroup.id}-ingredients-Water-amount"]`)
        const waterOutput = subject.find(`[id="${factory.id}-${buildingGroup.id}-products-Water-amount"]`)

        expect(waterInput.attributes('value')).toBe('10')
        expect(waterOutput.attributes('value')).toBe('8')
      })
    })
  })

  describe('power producers', () => {
    let powerProducer: FactoryPowerProducer

    beforeEach(() => {
      addPowerProducerToFactory(factory, {
        building: 'generatornuclear',
        powerAmount: 2500,
        recipe: 'GeneratorNuclear_NuclearFuelRod',
        updated: FactoryPowerChangeType.Power,
      })
      powerProducer = factory.powerProducers[0]
      powerProducer.buildingGroupsTrayOpen = true // This needs to exist or nothing renders
      buildingGroup = powerProducer.buildingGroups[0]
      calculateFactories([factory], gameData)
      subject = mountPowerProducer(factory)
    })

    describe('adding 2nd group', () => {
      let newBuildingGroup: BuildingGroup

      beforeEach(async () => {
        const button = subject.find(`[id="${factory.id}-add-building-group"]`)
        await button.trigger('click')

        newBuildingGroup = powerProducer.buildingGroups[1]
      })

      it('should add a new power producer group with correct metrics', () => {
        const count = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-building-count"]`)
        expect(count.exists()).toBe(true)
        expect(count.attributes('value')).toBe('0')

        const clock = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-clock"]`)
        expect(clock.attributes('value')).toBe('100')
      })

      it('should add a power producer with the correct parts (zeroed)', () => {
        const fuelRodAmount = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-parts-NuclearFuelRod-amount"]`)

        expect(fuelRodAmount.exists()).toBe(true)
        expect(fuelRodAmount.attributes('value')).toBe('0')

        const waterAmount = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-Water-amount"]`)

        expect(waterAmount.exists()).toBe(true)
        expect(waterAmount.attributes('value')).toBe('0')

        const nuclearWasteAmount = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-parts-NuclearWaste-amount"]`)

        expect(nuclearWasteAmount.exists()).toBe(true)
        expect(nuclearWasteAmount.attributes('value')).toBe('0')

        // Expect there to only be one count of nuclear waste, it should not have multiple elements of the same ID
        expect(subject.findAll(`[id="${factory.id}-${newBuildingGroup.id}-parts-NuclearWaste-amount"]`).length).toBe(1)
      })

      it('should display power production', () => {
        const power = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-power"]`)
        const powerAmountCalculated = formatPower(newBuildingGroup.powerProduced)
        const powerDisplay = `${powerAmountCalculated.value} ${powerAmountCalculated.unit}`
        expect(power.text()).toBe(powerDisplay)
      })
    })

    describe('group<->powerproducer sync', () => {
      beforeEach(() => {
        powerProducer.buildingGroupItemSync = true
      })

      it('should be enabled by default', () => {
        const toggleSyncButton = subject.find(`[id="${factory.id}-${powerProducer.id}-toggle-sync"]`)

        expect(powerProducer.buildingGroupItemSync).toBe(true)
        expect(toggleSyncButton.text()).toBe('Enabled')
      })

      it('should be disabled when a new group is added', async () => {
        const button = subject.find(`[id="${factory.id}-add-building-group"]`)
        await button.trigger('click')

        const toggleSyncButton = subject.find(`[id="${factory.id}-${powerProducer.id}-toggle-sync"]`)

        expect(powerProducer.buildingGroupItemSync).toBe(false)
        expect(toggleSyncButton.text()).toBe('Disabled')
      })

      it('should update the power producer when enabled and the building count is changed (single group)', async () => {
        const count = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
        await count.setValue('2')

        const powerProducerBuildingCount = subject.find(`[id="${factory.id}-${powerProducer.id}-building-count"]`)
        expect(powerProducerBuildingCount.attributes('value')).toBe('2')
      })

      it('should update the power producer when enabled and the building count is changed (multi-group)', async () => {
        // Add another group
        const addGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
        await addGroupButton.trigger('click')

        // Set new group's building counts to 10
        const newGroupCount = subject.find(`[id="${factory.id}-${powerProducer.buildingGroups[1].id}-building-count"]`)
        await newGroupCount.setValue('10')
        expect(powerProducer.buildingGroups[1].buildingCount).toBe(10)

        // Set original building count to 2, totalling to 12
        const count = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
        await count.setValue('2')

        const powerProducerBuildingCount = subject.find(`[id="${factory.id}-${powerProducer.id}-building-count"]`)
        expect(powerProducerBuildingCount.attributes('value')).toBe('12')
        expect(powerProducer.buildingCount).toBe(12)
      })
    })

    describe('power calculations', () => {
      it('should display power production for power producers and at the correct value', async () => {
        const buildingCount = subject.find(`[id="${factory.id}-${buildingGroup.id}-building-count"]`)
        const power = subject.find(`[id="${factory.id}-${buildingGroup.id}-power"]`)

        await buildingCount.setValue('10')
        expect(power.text()).toBe(`25 GW`)

        await buildingCount.setValue('15')
        expect(power.text()).toBe(`37.5 GW`)
      })
    })
  })
})
