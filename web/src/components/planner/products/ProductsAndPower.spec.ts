import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import vuetify from '@/plugins/vuetify'
import ProductsAndPower from './ProductsAndPower.vue'
import { calculateFactories, calculateFactory, CalculationModes, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import type { Factory } from '@/interfaces/planner/FactoryInterface'
import { fetchGameData } from '@/utils/gameDataService'
import eventBus from '@/utils/eventBus'

const gameData = await fetchGameData()

/**
 * A blank row and a reorder change the stored record and recalculate nothing, so this
 * component's own handlers are the only thing that can announce them. `factoryEdited` is
 * intent: a rebase carries over only the factories the user is recorded as having touched.
 */
describe('Component: ProductsAndPower', () => {
  let factory: Factory

  const mountSubject = () =>
    mount(ProductsAndPower, {
      props: { factory, helpText: false },
      global: {
        plugins: [vuetify],
        stubs: { FactoryStatusChips: true },
        provide: {
          updateFactory: (target: Factory, modes: CalculationModes) => {
            calculateFactory(target, [target], gameData, modes)
          },
        },
      },
    })

  const buttonSaying = (subject: ReturnType<typeof mountSubject>, text: string) =>
    subject.findAll('button').find(button => button.text().includes(text))!

  const edited = () => expect(eventBus.emit).toHaveBeenCalledWith('factoryEdited', factory)

  beforeEach(() => {
    setActivePinia(createPinia())
    factory = newFactory('Iron Ingots', 0, 1)
    addProductToFactory(factory, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
    addProductToFactory(factory, { id: 'IronPlate', amount: 20, recipe: 'IronPlate' })
    calculateFactories([factory], gameData)
    vi.spyOn(eventBus, 'emit').mockClear()
  })

  it('records an added product row', async () => {
    const subject = mountSubject()

    await buttonSaying(subject, 'Add Product').trigger('click')

    expect(factory.products).toHaveLength(3)
    edited()
  })

  it('records an added power generator row', async () => {
    const subject = mountSubject()

    await buttonSaying(subject, 'Add Power Generator').trigger('click')

    expect(factory.powerProducers).toHaveLength(1)
    edited()
  })

  it('records a product reorder', async () => {
    const subject = mountSubject()
    // The first product's controls: up (disabled at the top), down, delete.
    const down = subject.findAll('.factory-item-controls')[0].findAll('button')[1]

    await down.trigger('click')

    expect(factory.products.map(product => product.id)).toEqual(['IronPlate', 'IronIngot'])
    edited()
  })
})
