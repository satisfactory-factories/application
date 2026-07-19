import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import Product from './Product.vue'
import { calculateFactory, CalculationModes, newFactory } from '@/utils/factory-management/factory'
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
        updateFactory: (factory: any, modes: CalculationModes) => {
          calculateFactory(factory, [factory], gameData, modes)
        },
      },
    },
  })
}

describe('Component: Product', () => {
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

  it('should update produced amount when requirement amount is changed', async () => {
    calculateFactory(factory, [factory], gameData)
    subject = mountSubject(factory) // Remount the subject as things have changed

    const productionInput = subject.find(`[id="${factory.id}-IronIngot-amount"]`)
    expect((productionInput.element as HTMLInputElement).value).toBe('30')
    const ironOreInput = subject.find(`[id="${factory.id}-IronIngot-OreIron-amount"]`)
    expect((ironOreInput.element as HTMLInputElement).value).toBe('30')

    await ironOreInput.setValue('60')
    expect((productionInput.element as HTMLInputElement).value).toBe('60')
  })

  it('should update produced amount when byproduct amount is changed', async () => {
    addProductToFactory(factory, {
      id: 'LiquidFuel',
      amount: 40,
      recipe: 'LiquidFuel',
    })
    calculateFactory(factory, [factory], gameData)
    subject = mountSubject(factory) // Remount the subject as things have changed

    const productionInput = subject.find(`[id="${factory.id}-LiquidFuel-amount"]`)
    expect((productionInput.element as HTMLInputElement).value).toBe('40')
    const byProductInput = subject.find('input[name="LiquidFuel.byProducts.PolymerResin"]')
    expect((byProductInput.element as HTMLInputElement).value).toBe('30')

    await byProductInput.setValue('60')
    expect((productionInput.element as HTMLInputElement).value).toBe('80')
  })

  it('should prevent a breakage when the input amount is set to negative numbers', async () => {
    const productionInput = subject.find(`[id="${factory.id}-IronIngot-amount"]`)
    await productionInput.setValue('-123')

    // The amount input is debounced (750ms)
    await new Promise(resolve => setTimeout(resolve, 1000))

    expect((productionInput.element as HTMLInputElement).value).toBe('1')
  })

  it('should disable the building groups toggle when the product has no item selected', () => {
    addProductToFactory(factory, {
      id: '',
      amount: 1,
      recipe: '',
    })
    calculateFactory(factory, [factory], gameData)
    subject = mountSubject(factory)

    const emptyProduct = factory.products[1]
    const toggle = subject.find(`[id="${factory.id}-${emptyProduct.id}-building-groups-toggle"]`)
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('disabled')).toBeDefined()

    // The populated product's toggle stays enabled
    const populatedToggle = subject.find(`[id="${factory.id}-IronIngot-building-groups-toggle"]`)
    expect(populatedToggle.attributes('disabled')).toBeUndefined()
  })

  it('should open and close the building groups tray via the full-width toggle button', async () => {
    const product = factory.products[0]
    const toggle = subject.find(`[id="${factory.id}-${product.id}-building-groups-toggle"]`)
    expect(toggle.exists()).toBe(true)
    expect(toggle.text()).toContain('Open Building Groups (1)')
    expect(product.buildingGroupsTrayOpen).toBe(false)

    await toggle.trigger('click')
    expect(product.buildingGroupsTrayOpen).toBe(true)
    expect(toggle.text()).toContain('Close Building Groups')
    // The tray content should now be rendered
    expect(subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`).exists()).toBe(true)

    await toggle.trigger('click')
    expect(product.buildingGroupsTrayOpen).toBe(false)
    expect(subject.find(`[id="${factory.id}-${product.id}-effective-buildings"]`).exists()).toBe(false)
  })
})
