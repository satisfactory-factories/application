import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import PowerProducer from './PowerProducer.vue'
import TooltipInfo from '@/components/tooltip-info.vue'
import { calculateFactory, CalculationModes, newFactory } from '@/utils/factory-management/factory'
import { useGameDataStore } from '@/stores/game-data-store'
import {
  BuildingGroup,
  Factory,
  FactoryPowerChangeType,
  FactoryPowerProducer,
  ItemType,
} from '@/interfaces/planner/FactoryInterface'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addBuildingGroup } from '@/utils/factory-management/building-groups/common'
import { getBuildingDisplayName } from '@/utils/factory-management/common'

const gameData = useGameDataStore().getGameData()

const mountSubject = (factory: Factory) => {
  return mount(PowerProducer, {
    propsData: {
      factory,
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
let subject: VueWrapper<{ factory: Factory }>

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
      await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc
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
      await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc
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
      await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc
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
      await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc
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

// An Alien Power Augmenter split across groups cannot honour a building count typed on the
// producer line: it has no clock, so a share of a building has nowhere to go, and nothing on the
// row says which group should grow. The control is taken away — and has to say so, because a
// greyed-out field on its own tells you only that it stopped working, never why.
describe('Component: PowerProducer (augmenter building count)', () => {
  let augmenterFactory: Factory
  let augmenter: FactoryPowerProducer
  let augmenterSubject: VueWrapper<{ factory: Factory }>

  const countField = (): Element | null =>
    augmenterSubject.element.querySelector(`[id="${augmenterFactory.id}-${augmenter.id}-building-count"]`)

  const buildingChip = (): Element => {
    const chip = [...augmenterSubject.element.querySelectorAll('.v-chip')]
      .find(candidate => /Augmenter|Generator/.test(candidate.textContent ?? ''))
    if (!chip) throw new Error('No building chip on the producer row')
    return chip
  }

  const buildProducer = (building: string, recipe: string, groups: number) => {
    setActivePinia(createPinia())
    augmenterFactory = newFactory('Alien Power')
    addPowerProducerToFactory(augmenterFactory, {
      building,
      buildingAmount: 3,
      recipe,
      updated: FactoryPowerChangeType.Building,
    })
    augmenter = augmenterFactory.powerProducers[0]

    for (let added = 1; added < groups; added++) {
      addBuildingGroup(augmenter, ItemType.Power, augmenterFactory)
    }

    calculateFactory(augmenterFactory, [augmenterFactory], gameData)
    augmenterSubject = mountSubject(augmenterFactory)
  }

  describe('with a single group', () => {
    beforeEach(() => buildProducer('alienpoweraugmenter', 'AlienPowerAugmenter', 1))

    it('should let the count be edited', () => {
      expect(countField()?.tagName).toBe('INPUT')
      expect((countField() as HTMLInputElement).disabled).toBe(false)
    })

    it('should state the one-grid assumption the boost relies on', () => {
      expect(augmenterSubject.text()).toContain('one power grid')
    })
  })

  describe('with more than one group', () => {
    beforeEach(() => buildProducer('alienpoweraugmenter', 'AlienPowerAugmenter', 2))

    it('should hand the count to the groups rather than offer a field', () => {
      // Not an input at all: there is nothing sensible for a typed figure to do.
      expect(countField()?.tagName).toBe('SPAN')
      // The figure itself stays readable — it is still what the factory builds.
      expect(countField()?.textContent?.trim()).toBe('3')
    })

    it('should say it is disabled, and why', () => {
      expect(buildingChip().textContent).toContain('Disabled')
      expect(buildingChip().querySelector('.fa-info-circle')).not.toBeNull()
    })

    // House style: the planner's copy uses ordinary punctuation, not em dashes. The tooltip only
    // mounts its content on hover, so the wording is read off the prop rather than the DOM.
    it('should explain it without an em dash', () => {
      const explanations = augmenterSubject.findAllComponents(TooltipInfo)
        .map(tooltip => tooltip.props('text') as string)
        .filter(text => text.includes('no way to give a group half a building'))

      expect(explanations).toHaveLength(1)
      expect(explanations[0]).not.toContain('\u2014')
    })
  })

  describe('a generator that can overclock', () => {
    beforeEach(() => buildProducer('generatorfuel', 'GeneratorFuel_LiquidFuel', 2))

    it('should keep the count editable across multiple groups', () => {
      // A fuel generator has a clock, so a fractional share has somewhere to go.
      expect(countField()?.tagName).toBe('INPUT')
      expect((countField() as HTMLInputElement).disabled).toBe(false)
    })

    it('should not claim anything about the power grid', () => {
      expect(augmenterSubject.text()).not.toContain('one power grid')
    })
  })
})
