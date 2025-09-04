import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import PowerProducer from './PowerProducer.vue'
import { calculateFactory, CalculationModes, newFactory } from '@/utils/factory-management/factory'
import { useGameDataStore } from '@/stores/game-data-store'
import {
  BuildingGroup,
  Factory,
  FactoryPowerChangeType,
  FactoryPowerProducer,
} from '@/interfaces/planner/FactoryInterface'
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
        updateFactory: (factory: any, modes: CalculationModes) => {
          calculateFactory(factory, [factory], gameData, modes)
        },
        updateOrder: (x: any) => x,
      },
    },
  })
}

let buildingText: any
let recipeText: any
let fuelQuantity: any
let powerAmount: any
let buildingCount: any
let factory: Factory
let subject: VueWrapper<{factory: Factory, helpText: boolean }>

const updateElements = (powerProducer: FactoryPowerProducer) => {
  // Elements
  // Jesus fucking christ this is a lot of work just to get some text... god damn vuetify wrappers!
  const buildingAutocompleteWrapper = subject.find(`[id="${factory.id}-${powerProducer.id}-building"]`)
  const buildingParent = buildingAutocompleteWrapper.element.parentElement
  buildingText = buildingParent ? buildingParent.querySelector('.v-autocomplete__selection-text')?.textContent : null

  const recipeAutocompleteWrapper = subject.find(`[id="${factory.id}-${powerProducer.id}-recipe"]`)
  const recipeParent = recipeAutocompleteWrapper.element.parentElement
  recipeText = recipeParent ? recipeParent.querySelector('.v-autocomplete__selection-text')?.textContent : null

  fuelQuantity = subject.find(`[id="${factory.id}-${powerProducer.id}-fuel-quantity"]`)
  powerAmount = subject.find(`[id="${factory.id}-${powerProducer.id}-power-amount"]`)
  buildingCount = subject.find(`[id="${factory.id}-${powerProducer.id}-building-count"]`)
}

describe('Component: PowerProducer', () => {
  let powerProducer: FactoryPowerProducer
  let buildingGroup: BuildingGroup

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
    buildingGroup = powerProducer.buildingGroups[0]

    calculateFactory(factory, [factory], gameData)
    subject = mountSubject(factory)

    await nextTick()

    updateElements(powerProducer)
  })

  it('should initialize the data model correctly', () => {
    expect(powerProducer.building).toBe('generatornuclear')
    expect(powerProducer.recipe).toBe('GeneratorNuclear_NuclearFuelRod')
    expect(powerProducer.ingredients[0].perMin).toBe(0.2)
    expect(powerProducer.byproduct?.amount).toBe(10)
    expect(powerProducer.powerProduced).toBe(2500)
  })

  it('should initialize the elements correctly', () => {
    expect(buildingText).toBe('Nuclear Power Plant')
    expect(recipeText).toBe('Uranium Fuel Rod')
    expect(fuelQuantity.element.value).toBe('0.2')
    expect(powerAmount.element.value).toBe('2500')
    expect(buildingCount.element.value).toBe('1')
  })

  // Honestly, this is a massive ballache, I have no idea how to do this without a massive amount of work, due to Vuetify's teleporting.
  // describe('building selection changes', () => {
  // beforeEach(async () => {
  //   // Can't manipulate the autocomplete directly (or rather, we can, but it is a massive pain in the ass), so we'll just set the building directly and call calculate
  //   powerProducer.building = 'generatorcoal'
  //   powerProducer.updated = FactoryPowerChangeType.Building
  //
  //   // Calculate and remount as the elements are re-drawn
  //   calculateFactory(factory, [factory], gameData)
  //   subject = mountSubject(factory)
  //
  //   await nextTick()
  //
  //   updateElements(powerProducer)
  // })
  //
  //   it('should have wiped the recipe', () => {
  //     expect(powerProducer.recipe).toBe(null)
  //   })
  //
  //   it('should update the building selector', () => {
  //     expect(buildingText.value).toBe('Coal-Powered Generator')
  //   })
  //
  //   it('should update the power amount', () => {
  //     expect(powerAmount.element.value).toBe('75') // As we now have a building count of 1
  //   })
  //
  //   it('should update the building count', () => {
  //     expect(buildingCount.element.value).toBe('1') // As we don't copy the amount over
  //   })
  //
  //   it('should update the building group\'s building count', () => {
  //     buildingGroup.buildingCount = 10
  //   })
  // })

  // Too much work, it's really hard to accomplish via tests.
  // describe('recipe selection changes', () => {
  //
  // })

  describe('fuel quantity changes', () => {
    beforeEach(async () => {
      await fuelQuantity.setValue('2')
    })

    it('should update the power amount itself', () => {
      expect(fuelQuantity.element.value).toBe('2')
    })

    it('should update the power amount', () => {
      expect(powerAmount.element.value).toBe('25000')
    })

    it('should update the building count', () => {
      expect(buildingCount.element.value).toBe('10')
    })

    it('should update the building group\'s building count', () => {
      buildingGroup.buildingCount = 10
    })
  })

  describe('power amount changes', () => {
    beforeEach(async () => {
      await powerAmount.setValue('10000')
    })

    it('should update the power amount itself', () => {
      expect(powerAmount.element.value).toBe('10000')
    })

    it('should update the fuel quantity', () => {
      expect(fuelQuantity.element.value).toBe('0.8')
    })

    it('should update the building count', () => {
      expect(buildingCount.element.value).toBe('4')
    })

    it('should update the building group\'s building count', () => {
      buildingGroup.buildingCount = 4
    })

    it('should also update the power producer\'s and factory power produced', () => {
      expect(powerProducer.powerProduced).toBe(10000)
      expect(factory.power.produced).toBe(10000)
    })
  })

  describe('requirement part amount changes', () => {
    let requirementAmount: any

    beforeEach(async () => {
      requirementAmount = subject.find(`[id="${factory.id}-${powerProducer.id}-Water"]`)
      requirementAmount.setValue('480')
    })

    it('should update the data model', () => {
      expect(powerProducer.ingredients[1].perMin).toBe(480) // Was 240
    })

    it('should update the building amount', () => {
      expect(buildingCount.element.value).toBe('2') // Was 1
    })

    it('should update the power amount', () => {
      expect(powerAmount.element.value).toBe('5000') // Was 2500
    })
  })

  describe('building count changes', () => {
    beforeEach(async () => {
      await buildingCount.setValue(10) // Was 1
    })

    it('should update the building count itself', () => {
      expect(buildingCount.element.value).toBe('10')
    })

    it('should update the fuel quantity', () => {
      expect(fuelQuantity.element.value).toBe('2')
    })

    it('should update the power amount', () => {
      expect(powerAmount.element.value).toBe('25000')
    })

    it('should update the building group\'s building count', () => {
      buildingGroup.buildingCount = 10
    })
  })
})
