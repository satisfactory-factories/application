import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import PlannerFactory from './PlannerFactory.vue'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { calculateFactories } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'

describe('Component: PlannerFactory (collapsed view)', () => {
  let factory: Factory

  const mountSubject = () =>
    mount(PlannerFactory, {
      propsData: { factory, helpText: false, totalFactories: 1 },
      global: {
        plugins: [vuetify],
        provide: {
          findFactory: () => factory,
          copyFactory: () => {},
          deleteFactory: () => {},
          moveFactory: () => {},
          navigateToFactory: () => {},
          updateFactory: () => {},
        },
      },
    })

  const collapsedText = () => mountSubject().text()

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = newFactory('Test')
    factory.hidden = true
  })

  it('calls a factory with nothing in it empty', () => {
    calculateFactories([factory], gameData)

    expect(collapsedText()).toContain('Empty factory!')
  })

  it('does not call a factory holding only power generators empty', () => {
    addPowerProducerToFactory(factory, {
      building: 'generatorcoal',
      powerAmount: 75,
      recipe: 'GeneratorCoal_Coal',
      updated: FactoryPowerChangeType.Power,
    })
    calculateFactories([factory], gameData)

    expect(collapsedText()).not.toContain('Empty factory!')
  })

  it('lists a power generator under Producing with its building count and output', () => {
    addPowerProducerToFactory(factory, {
      building: 'generatorcoal',
      powerAmount: 75,
      recipe: 'GeneratorCoal_Coal',
      updated: FactoryPowerChangeType.Power,
    })
    calculateFactories([factory], gameData)

    const text = collapsedText()
    expect(text).toContain('Producing:')
    expect(text).toContain('Coal-Powered Generator')
    expect(text).toContain('1x')
    expect(text).toContain('+75 MW')
  })

  it('lists power generators alongside products', () => {
    addProductToFactory(factory, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    addPowerProducerToFactory(factory, {
      building: 'generatorcoal',
      powerAmount: 75,
      recipe: 'GeneratorCoal_Coal',
      updated: FactoryPowerChangeType.Power,
    })
    calculateFactories([factory], gameData)

    const text = collapsedText()
    expect(text).toContain('Iron Ingot')
    expect(text).toContain('Coal-Powered Generator')
  })
})
