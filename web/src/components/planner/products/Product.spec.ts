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
    propsData: {
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
  const factory = newFactory('test')
  let subject: VueWrapper<{factory: Factory, helpText: boolean }>

  beforeEach(() => {
    setActivePinia(createPinia())

    calculateFactory(factory, [factory], gameData)
    subject = mountSubject(factory)
  })

  test('should update produced amount when requirement amount is changed', async () => {
    addProductToFactory(factory, {
      id: 'IronIngot',
      amount: 30,
      recipe: 'IngotIron',
    })

    calculateFactory(factory, [factory], gameData)
    subject = mountSubject(factory) // Remount the subject as things have changed

    const productionInput = subject.find('input[name="IronIngot.amount"]')
    expect(productionInput?.attributes?.()?.value).toBe('30')
    const ironOreInput = subject.find('input[name="IronIngot.ingredients.OreIron"]')
    expect(ironOreInput?.attributes?.()?.value).toBe('30')

    await ironOreInput.setValue('60')
    expect(productionInput?.attributes?.()?.value).toBe('60')
  })

  test('should update produced amount when byproduct amount is changed', async () => {
    addProductToFactory(factory, {
      id: 'LiquidFuel',
      amount: 40,
      recipe: 'LiquidFuel',
    })
    calculateFactory(factory, [factory], gameData)
    subject = mountSubject(factory) // Remount the subject as things have changed

    const productionInput = subject.find('input[name="LiquidFuel.amount"]')
    expect(productionInput?.attributes?.()?.value).toBe('40')
    const byProductInput = subject.find('input[name="LiquidFuel.byProducts.PolymerResin"]')
    expect(byProductInput?.attributes?.()?.value).toBe('30')

    await byProductInput.setValue('60')
    expect(productionInput?.attributes?.()?.value).toBe('80')
  })

  test('should prevent a breakage when the input amount is set to negative numbers', async () => {
    const productionInput = subject.find('input[name="IronIngot.amount"]')
    await productionInput.setValue('-123')
    expect(productionInput?.attributes?.()?.value).toBe('0.1')
  })
})
