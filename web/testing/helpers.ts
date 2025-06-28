import { vi } from 'vitest'
import { mount } from '@vue/test-utils'
import vuetify from '../src/plugins/vuetify'
import { calculateFactory, CalculationModes } from '../src/utils/factory-management/factory'
import { Factory } from '../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../src/utils/gameDataService'
import PlannerFactorySatisfaction from '../src/components/planner/PlannerFactorySatisfaction.vue'

// @ts-ignore // this is fine, it works, stop moaning
const gameData = await fetchGameData()

export const mountItem = (factory: Factory, component: any) => {
  return mount(component, {
    propsData: {
      factory,
      helpText: false,
    },
    global: {
      plugins: [vuetify],
      provide: {
        updateFactory: (factory: any, modes: CalculationModes) => {
          calculateFactory(factory, [factory], gameData, modes)
        },
        updateOrder: () => vi.fn(),
      },
    },
  })
}

export const mountSatisfaction = (factory: Factory) => {
  return mount(PlannerFactorySatisfaction, {
    propsData: {
      factory,
      helpText: false,
    },
    global: {
      plugins: [vuetify],
      provide: {
        updateFactory: (factory: any, modes: CalculationModes) => {
          calculateFactory(factory, [factory], gameData, modes)
        },
        findFactory: () => vi.fn(),
      },
    },
  })
}
