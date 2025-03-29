import vuetify from '@/plugins/vuetify'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from '@/components/planner/products/Product.vue'
import PowerProducer from '@/components/planner/products/PowerProducer.vue'
import { calculateFactories, calculateFactory, CalculationModes, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import {
  BuildingGroup,
  Factory,
  FactoryItem,
  FactoryPowerChangeType,
  FactoryPowerProducer, GroupType,
} from '@/interfaces/planner/FactoryInterface'
import { fetchGameData } from '@/utils/gameDataService'
import { addBuildingGroup } from '../../../src/utils/factory-management/building-groups/common'

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

describe('TDD: BG-C-D: Building Groups: Creation and Deletion', () => {
  let factory: Factory
  let product: FactoryItem

  beforeEach(() => {
    factory = newFactory('BC-C-D Factory')
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 60, // 2 Buildings
      recipe: 'IngotIron',
    })
    product = factory.products[0]
  })

  describe('creation', () => {
    let buildingGroup: BuildingGroup

    beforeEach(() => {
      buildingGroup = product.buildingGroups[0]
    })

    test('BC-C-D-1: Create a new building group upon product addition', async () => {
      expect(buildingGroup.buildingCount).toBe(1)
    })

    test('BC-C-D-2: Create a second building group', async () => {
      addBuildingGroup(product, GroupType.Product, factory)

      expect(product.buildingGroups[1].buildingCount).toBe(0)
      // It should not have affected the product or the other group
      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingRequirements.amount).toBe(2)
    })

    test('BC-C-D-3: Upon creating new product, creates a BG count with the expected building size', async () => {
      addProductToFactory(factory, {
        id: 'CopperIngot',
        amount: 600, // 20 Buildings
        recipe: 'IngotCopper',
      })
      const product2 = factory.products[1]

      expect(product2.buildingGroups[0].buildingCount).toBe(20)
      // It should not affect the other product or BG
      expect(product.buildingGroups[0].buildingCount).toBe(2)
      expect(product.buildingRequirements.amount).toBe(2)
    })
  })
})
