import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import Product from './Product.vue'
import { calculateFactory, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { useGameDataStore } from '@/stores/game-data-store'
import { Factory } from '@/interfaces/planner/FactoryInterface'

const gameData = useGameDataStore().getGameData()

const mountSubject = (factory: Factory) => {
  return mount(Product, {
    props: {
      factory,
      helpText: false,
    },
    global: {
      plugins: [vuetify],
      provide: {
        getBuildingDisplayName: (x: any) => x,
        updateFactory: (factory: any) => {
          calculateFactory(factory, [factory], gameData)
        },
      },
    },
  })
}

describe('Product', () => {
  let factory = newFactory('test')
  let subject: VueWrapper<{factory: Factory, helpText: boolean }>

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = newFactory('test')

    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 30,
      recipe: 'IngotIron',
    })

    calculateFactory(factory, [factory], gameData)
    subject = mountSubject(factory)
  })

  test('should render products correctly', () => {
    expect(subject.exists()).toBe(true)
    expect(factory.products).toHaveLength(1)
    expect(factory.products[0].id).toBe('IronIngot')
    expect(factory.products[0].amount).toBe(30)
  })

  test('should display the correct product information', () => {
    const products = subject.findAll('.product')
    expect(products).toHaveLength(1)
    
    // Check that the product name is displayed
    expect(subject.text()).toContain('Iron Ingot')
  })

  test('should have the correct factory structure after calculation', () => {
    expect(factory.products[0].recipe).toBe('IngotIron')
    expect(factory.products[0].requirements).toBeDefined()
    expect(Object.keys(factory.products[0].requirements)).toContain('OreIron')
  })
})
