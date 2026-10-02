// End to end through the real components: tick an export where the player ticks it (the export
// chip under Satisfaction, and the Checklist panel), and check the offer that comes up, and what
// each way out of it does to the import on the destination factory.
import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import LinkedImportTickDialog from './LinkedImportTickDialog.vue'
import PlannerFactorySatisfactionItems from './PlannerFactorySatisfactionItems.vue'
import PlannerFactoryChecklist from './PlannerFactoryChecklist.vue'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { useGameDataStore } from '@/stores/game-data-store'
import { useLinkedImportTick } from '@/composables/useLinkedImportTick'
import { Factory } from '@/interfaces/planner/FactoryInterface'

const gameData = useGameDataStore().getGameData()

const dialogText = () => document.body.querySelector('.v-overlay-container')?.textContent ?? ''
const button = (id: string) => document.body.querySelector<HTMLElement>(`#${id}`)
const tick = (wrapper: ReturnType<typeof mount>) => wrapper.find('input.checklist-tick')

const buildFactories = () => {
  const producer = reactive(newFactory('Iron Ingots', 0, 1)) as Factory
  const consumer = reactive(newFactory('Phase Three', 0, 2)) as Factory
  addProductToFactory(producer, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
  addProductToFactory(consumer, { id: 'IronPlate', amount: 500, recipe: 'IronPlate' })
  addInputToFactory(consumer, { factoryId: producer.id, outputPart: 'IronIngot', amount: 500 })
  calculateFactories([producer, consumer], gameData)
  producer.checklistEnabled = true
  return { producer, consumer }
}

const mountAll = (producer: Factory, consumer: Factory) => {
  const factories = [producer, consumer]
  const global = {
    plugins: [vuetify],
    provide: {
      updateFactory: () => {},
      findFactory: (id: string | number) => factories.find(f => f.id === Number(id)),
      navigateToFactory: () => {},
    },
  }
  const satisfaction = mount(PlannerFactorySatisfactionItems, { props: { factory: producer }, global })
  const checklist = mount(PlannerFactoryChecklist, { props: { factory: producer }, global })
  const dialog = mount(LinkedImportTickDialog, { global, attachTo: document.body })
  return { satisfaction, checklist, dialog }
}

describe('LinkedImportTickDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  afterEach(() => {
    useLinkedImportTick().dismiss()
  })

  it('offers to tick the import, and to turn the checklist on, when an export is ticked', async () => {
    const { producer, consumer } = buildFactories()
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()

    expect(producer.checklistExports['2:IronIngot']).toBe(true)
    expect(dialogText()).toContain('Also tick the import?')
    expect(dialogText()).toContain('Iron Ingot')
    expect(dialogText()).toContain('Phase Three')
    expect(dialogText()).toContain('from Iron Ingots')
    expect(dialogText()).toContain('Turn on the checklist for Phase Three')
    // Only an offer: nothing on the destination has moved yet.
    expect(consumer.inputs[0].completed).toBeFalsy()
  })

  it('ticks the import and turns the checklist on when confirmed as offered', async () => {
    const { producer, consumer } = buildFactories()
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    button('linked-import-confirm')!.click()
    await flushPromises()

    expect(consumer.inputs[0].completed).toBe(true)
    expect(consumer.inputs[0].checklistSyncedAmount).toBe(500)
    expect(consumer.checklistEnabled).toBe(true)
    expect(useLinkedImportTick().pending.value).toBeNull()
  })

  it('stores the tick without turning the checklist on when the switch is turned off', async () => {
    const { producer, consumer } = buildFactories()
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLInputElement>('#linked-import-enable-checklist')!.click()
    await flushPromises()
    button('linked-import-confirm')!.click()
    await flushPromises()

    expect(consumer.inputs[0].completed).toBe(true)
    expect(consumer.checklistEnabled).toBe(false)
  })

  it('leaves the destination alone when declined', async () => {
    const { producer, consumer } = buildFactories()
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    button('linked-import-decline')!.click()
    await flushPromises()

    expect(producer.checklistExports['2:IronIngot']).toBe(true)
    expect(consumer.inputs[0].completed).toBeFalsy()
    expect(consumer.checklistEnabled).toBe(false)
    expect(useLinkedImportTick().pending.value).toBeNull()
  })

  it('offers the same from the Checklist panel', async () => {
    const { producer, consumer } = buildFactories()
    const { checklist } = mountAll(producer, consumer)

    const exportsGroup = checklist.findAll('.checklist-group')
      .find(group => group.find('.checklist-group-title').text() === 'Exports')!
    await exportsGroup.find('input.checklist-tick').trigger('click')
    await flushPromises()

    expect(dialogText()).toContain('Also tick the import?')
  })

  it('offers to untick both ends, without the checklist switch', async () => {
    const { producer, consumer } = buildFactories()
    consumer.checklistEnabled = true
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    expect(dialogText()).not.toContain('Turn on the checklist')
    button('linked-import-confirm')!.click()
    await flushPromises()
    expect(consumer.inputs[0].completed).toBe(true)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    expect(dialogText()).toContain('Also untick the import?')
    button('linked-import-confirm')!.click()
    await flushPromises()

    expect(producer.checklistExports['2:IronIngot']).toBe(false)
    expect(consumer.inputs[0].completed).toBe(false)
  })

  it('does not ask when the import already matches', async () => {
    const { producer, consumer } = buildFactories()
    consumer.inputs[0].completed = true
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()

    expect(useLinkedImportTick().pending.value).toBeNull()
  })

  it('does not ask when a click only re-confirms a desynced export', async () => {
    const { producer, consumer } = buildFactories()
    producer.checklistExports['2:IronIngot'] = true
    producer.checklistExportSyncedAmounts['2:IronIngot'] = 400
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()

    expect(producer.checklistExportSyncedAmounts['2:IronIngot']).toBe(500)
    expect(useLinkedImportTick().pending.value).toBeNull()
  })
})
