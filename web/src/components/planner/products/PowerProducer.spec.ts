import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import PowerProducer from './PowerProducer.vue'
import { calculateFactory, newFactory } from '@/utils/factory-management/factory'
import { useGameDataStore } from '@/stores/game-data-store'
import { Factory, FactoryPowerChangeType, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { getBuildingDisplayName } from '@/utils/factory-management/common'

const gameData = useGameDataStore().getGameData()

const mountSubject = (factory: Factory) => {
  return mount(PowerProducer, {
    propsData: {
      factory,
      helpText: false,
    },
    global: {
      plugins: [vuetify],
      provide: {
        getBuildingDisplayName: (x: any) => getBuildingDisplayName(x),
        updateFactory: (factory: any) => {
          calculateFactory(factory, [factory], gameData)
        },
        updateOrder: (x: any) => x,
      },
    },
  })
}

describe('Component: PowerProducer', () => {
  let factory: Factory
  let subject: VueWrapper<{factory: Factory, helpText: boolean }>
  let buildingText: any
  let recipeText: any
  let fuelQuantity: any
  let powerAmount: any
  let powerProducer: FactoryPowerProducer

  beforeEach(async () => {
    setActivePinia(createPinia())
    factory = newFactory('Testing PowerProducers')

    addPowerProducerToFactory(factory, {
      building: 'generatornuclear',
      buildingAmount: 1,
      recipe: 'GeneratorNuclear_NuclearFuelRod',
      updated: FactoryPowerChangeType.Building,
    })
    powerProducer = factory.powerProducers[0]

    calculateFactory(factory, [factory], gameData)
    subject = mountSubject(factory)

    await nextTick()

    // Elements
    // Jesus fucking christ this is a lot of work just to get some text... god damn vuetify wrappers!
    const buildingAutocompleteWrapper = subject.find(`[id="${factory.id}-${powerProducer.id}-building"]`)
    const buildingParent = buildingAutocompleteWrapper.element.parentElement
    buildingText = buildingParent ? buildingParent.querySelector('.v-autocomplete__selection-text')?.textContent : null

    const recipeAutocompletWarapper = subject.find(`[id="${factory.id}-${powerProducer.id}-recipe"]`)
    const recipeParent = recipeAutocompletWarapper.element.parentElement
    recipeText = recipeParent ? recipeParent.querySelector('.v-autocomplete__selection-text')?.textContent : null

    fuelQuantity = subject.find(`[id="${factory.id}-${powerProducer.id}-fuel-quantity"]`).element
    powerAmount = subject.find(`[id="${factory.id}-${powerProducer.id}-power-amount"]`).element
  })

  it('should initalize the data model correctly', () => {
    expect(powerProducer.building).toBe('generatornuclear')
    expect(powerProducer.recipe).toBe('GeneratorNuclear_NuclearFuelRod')
    expect(powerProducer.ingredients[0].perMin).toBe(0.2)
    expect(powerProducer.byproduct?.amount).toBe(10)
    expect(powerProducer.powerProduced).toBe(2500)
  })

  it('should initialize the html correctly', () => {
    expect(buildingText).toBe('Nuclear Power Plant')
    expect(recipeText).toBe('Uranium Fuel Rod')
    expect(fuelQuantity.value).toBe('0.2')
    expect(powerAmount.value).toBe('2500')
  })

  it('should update the power produced when the fuel quantity is updated', async () => {
  })
})
