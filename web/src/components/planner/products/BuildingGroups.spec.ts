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

describe('BuildingGroups', () => {
  let factory: Factory
  let subject: VueWrapper<{factory: Factory }>
  let buildingGroup: BuildingGroup

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = newFactory('Testing building groups')
  })

  describe('product', () => {
    let product: FactoryItem

    beforeEach(() => {
      addProductToFactory(factory, {
        id: 'IronIngot',
        amount: 30,
        recipe: 'IngotIron',
      })
      product = factory.products[0]
      product.buildingGroupsTrayOpen = true // This is needed otherwise nothing renders
      buildingGroup = product.buildingGroups[0]
      // This also adds the first building group
      calculateFactories([factory], gameData)
      subject = mountProduct(factory)
    })

    describe('adding groups', () => {
      let newBuildingGroup: BuildingGroup

      beforeEach(async () => {
        const button = subject.find(`[id="${factory.id}-add-building-group"]`)
        await button.trigger('click')

        // Get the ID of the new building group
        newBuildingGroup = product.buildingGroups[1]
      })

      it('should add a new building group of 1 building', async () => {
        const count = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-building-count"]`)

        expect(count.exists()).toBe(true)
        expect(count.attributes('value')).toBe('1')
      })

      it('should add a new building group of 1 building with 100% overclock', async () => {
        const clockElem = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)

        expect(clockElem.exists()).toBe(true)
        expect(clockElem.attributes('value')).toBe('100')
      })

      it('should add a new building group of 1 building with the correct parts', async () => {
        const oreIron = newBuildingGroup.parts.OreIron
        const oreIronElem = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-OreIron-amount"]`)

        expect(oreIronElem.exists()).toBe(true)
        expect(oreIronElem.attributes('value')).toBe(oreIron.toString())

        const ironIngot = newBuildingGroup.parts.IronIngot
        const ironIngotElem = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-IronIngot-amount"]`)

        expect(ironIngotElem.exists()).toBe(true)
        expect(ironIngotElem.attributes('value')).toBe(ironIngot.toString())
      })

      it('should not display power production for products', () => {
        const power = subject.find(`[id="${factory.id}-${buildingGroup.id}-power"]`)
        expect(power.exists()).toBe(false)
      })
    })

    describe('removing groups', () => {})

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

    describe('adding groups', () => {
      let newBuildingGroup: BuildingGroup

      beforeEach(async () => {
        const button = subject.find(`[id="${factory.id}-add-building-group"]`)
        await button.trigger('click')

        newBuildingGroup = powerProducer.buildingGroups[1]
      })

      it('should add a power producer with 1 building', () => {
        const count = subject.find(`[id="${factory.id}-${newBuildingGroup.id}-building-count"]`)
        expect(count.exists()).toBe(true)
        expect(count.attributes('value')).toBe('1')
      })

      it('should add a power producer with 1 building with 100% overclock', () => {
        const clockElem = subject.find(`[id="${factory.id}-${buildingGroup.id}-clock"]`)
        expect(clockElem.exists()).toBe(true)
        expect(clockElem.attributes('value')).toBe('100')
      })

      it('should add a power producer with 1 building with the correct parts', () => {
        const fuelRod = newBuildingGroup.parts.NuclearFuelRod
        const fuelRodElem = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-NuclearFuelRod-amount"]`)

        expect(fuelRodElem.exists()).toBe(true)
        expect(fuelRodElem.attributes('value')).toBe(fuelRod.toString())

        const water = newBuildingGroup.parts.Water
        const waterElem = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-Water-amount"]`)

        expect(waterElem.exists()).toBe(true)
        expect(waterElem.attributes('value')).toBe(water.toString())

        const nuclearWaste = newBuildingGroup.parts.NuclearWaste
        const nuclearWasteElem = subject.find(`[id="${factory.id}-${buildingGroup.id}-parts-NuclearWaste-amount"]`)

        expect(nuclearWasteElem.exists()).toBe(true)
        expect(nuclearWasteElem.attributes('value')).toBe(nuclearWaste.toString())

        // Expect there to only be one count of nuclear waste, it should not have multiple elements of the same ID
        expect(subject.findAll(`[id="${factory.id}-${buildingGroup.id}-parts-NuclearWaste-amount"]`).length).toBe(1)
      })

      it('should display power production', () => {
        const power = subject.find(`[id="${factory.id}-${buildingGroup.id}-power"]`)
        const powerAmountCalculated = formatPower(buildingGroup.powerProduced)
        const powerDisplay = `${powerAmountCalculated.value} ${powerAmountCalculated.unit}`
        expect(power.text()).toBe(powerDisplay)
      })
    })

    describe('removing groups', () => {})

    describe('checks', () => {
      it('should display power production for power producers and at the correct value', () => {
        const power = subject.find(`[id="${factory.id}-${buildingGroup.id}-power"]`)

        expect(power.exists()).toBe(true)
        expect(power.text()).toBe(`2.5 GW`)
      })
    })
  })
})
