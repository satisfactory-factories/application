// The import dialog's "Filter by demand" switch: remembered in this browser between openings, and
// held off (without overwriting the saved choice) where it would hide what the dialog needs to show.
import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ImportSourceDialog from './ImportSourceDialog.vue'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { useAppStore } from '@/stores/app-store'
import { useGameDataStore } from '@/stores/game-data-store'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { create46Scenario } from '@/utils/factory-setups/46-redistribution-hub'

const STORAGE_KEY = 'importFilterByDemand'

const filterInput = () =>
  document.body.querySelector<HTMLInputElement>('[data-testid="import-filter-demand"] input')!

describe('ImportSourceDialog demand filter', () => {
  let consumer: Factory
  let hub: Factory

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem(STORAGE_KEY)

    const gameData = useGameDataStore().getGameData()
    const producer = newFactory('Iron Factory', 0, 1)
    consumer = newFactory('Plates', 1, 2)
    hub = newFactory('Hub', 2, 3)
    addProductToFactory(producer, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    // Plates need Iron Ingots, so the consumer has demand; the hub has none.
    addProductToFactory(consumer, { id: 'IronPlate', amount: 20, recipe: 'IronPlate' })
    const factories = [producer, consumer, hub]
    calculateFactories(factories, gameData)
    useAppStore().getFactories = () => factories
  })

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.removeItem(STORAGE_KEY)
  })

  const open = async (factory: Factory) => {
    const wrapper = mount(ImportSourceDialog, {
      props: { factory, inputIndex: null, modelValue: true },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  it('starts on when nothing has been saved yet', async () => {
    await open(consumer)

    expect(filterInput().checked).toBe(true)
  })

  it('remembers being turned off for the next opening', async () => {
    const first = await open(consumer)
    filterInput().click()
    await flushPromises()

    expect(localStorage.getItem(STORAGE_KEY)).toBe('false')
    first.unmount()
    document.body.innerHTML = ''

    await open(consumer)
    expect(filterInput().checked).toBe(false)
  })

  it('opens off for a factory with no demand, without overwriting the saved choice', async () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    await open(hub)

    expect(filterInput().checked).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
  })
})

describe('ImportSourceDialog loop sources', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lists a source that would close a loop in red, and will not import from it', async () => {
    setActivePinia(createPinia())
    const factories = create46Scenario().getFactories()
    const [, hub, reinforced] = factories
    // Over-import so Reinforced Plates has plates to pass on, all of them from the Hub.
    reinforced.inputs[0].amount = 80
    calculateFactories(factories, useGameDataStore().getGameData())
    useAppStore().getFactories = () => factories

    // Re-pointing the Hub's own plate import.
    const wrapper = mount(ImportSourceDialog, {
      props: { factory: hub, inputIndex: 0, modelValue: true },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })
    await flushPromises()

    const loopRow = document.body.querySelector('.import-source-' + reinforced.id)!
    expect(loopRow.querySelector('[data-testid="import-source-loop"]')?.textContent?.trim())
      .toBe('Unable to import: Will create loop')
    expect(loopRow.querySelector('button')?.hasAttribute('disabled')).toBe(true)
    expect(document.body.querySelector('.import-source-' + factories[0].id + ' [data-testid="import-source-loop"]'))
      .toBeNull()
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})
