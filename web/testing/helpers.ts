import { mount } from '@vue/test-utils'
import vuetify from '../src/plugins/vuetify'
import { calculateFactory, CalculationModes } from '../src/utils/factory-management/factory'
import { Factory } from '../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../src/utils/gameDataService'
import PlannerFactorySatisfaction from '@/components/planner/PlannerFactorySatisfaction.vue'

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
        updateOrder: (factory: any) => {
          return 'foo'
        },
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
        findFactory: (id: string) => {
          return factory
        },
      },
    },
  })
}
