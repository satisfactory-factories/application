// End to end through the real components: tick an export where the player ticks it (the export
// chip under Satisfaction, and the Checklist panel), and check the offer that comes up, and what
// each way out of it does to the import on the destination factory.
import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import LinkedTickDialog from './LinkedTickDialog.vue'
import PlannerFactorySatisfactionItems from './PlannerFactorySatisfactionItems.vue'
import PlannerFactoryChecklist from './PlannerFactoryChecklist.vue'
import Imports from './imports/Imports.vue'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { useGameDataStore } from '@/stores/game-data-store'
import { useLinkedTick } from '@/composables/useLinkedTick'
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

// Every dialog mounted so far: a dialog left mounted from an earlier test still answers to the
// shared pending offer, so each test unmounts what it mounted.
let mounted: ReturnType<typeof mount>[] = []

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
  const dialog = mount(LinkedTickDialog, { global, attachTo: document.body })
  // The other end of the link: the consumer's own Imports table and Checklist panel.
  const imports = mount(Imports, { props: { factory: consumer }, global })
  const consumerChecklist = mount(PlannerFactoryChecklist, { props: { factory: consumer }, global })
  mounted = [satisfaction, checklist, dialog, imports, consumerChecklist]
  return { satisfaction, checklist, dialog, imports, consumerChecklist }
}

describe('LinkedTickDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mounted.forEach(wrapper => wrapper.unmount())
    mounted = []
    useLinkedTick().dismiss()
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
    expect(dialogText()).toContain('Also mark as imported')
    expect(dialogText()).toContain('Turn on the checklist for')
    // Only an offer: nothing on the destination has moved yet.
    expect(consumer.inputs[0].completed).toBeFalsy()
  })

  it('ticks the import and turns the checklist on when confirmed as offered', async () => {
    const { producer, consumer } = buildFactories()
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    button('linked-tick-apply')!.click()
    await flushPromises()

    expect(consumer.inputs[0].completed).toBe(true)
    expect(consumer.inputs[0].checklistSyncedAmount).toBe(500)
    expect(consumer.checklistEnabled).toBe(true)
    expect(useLinkedTick().pending.value).toBeNull()
  })

  it('switches off and locks the import switch when the checklist switch is turned off', async () => {
    const { producer, consumer } = buildFactories()
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLInputElement>('#linked-tick-enable-checklist')!.click()
    await flushPromises()

    const importSwitch = document.body.querySelector<HTMLInputElement>('#linked-tick-switch')!
    expect(importSwitch.checked).toBe(false)
    expect(importSwitch.disabled).toBe(true)

    button('linked-tick-apply')!.click()
    await flushPromises()

    expect(consumer.inputs[0].completed).toBeFalsy()
    expect(consumer.checklistEnabled).toBe(false)
  })

  it('unlocks the import switch, back on, when the checklist switch is turned on again', async () => {
    const { producer, consumer } = buildFactories()
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLInputElement>('#linked-tick-enable-checklist')!.click()
    await flushPromises()
    document.body.querySelector<HTMLInputElement>('#linked-tick-enable-checklist')!.click()
    await flushPromises()

    const importSwitch = document.body.querySelector<HTMLInputElement>('#linked-tick-switch')!
    expect(importSwitch.checked).toBe(true)
    expect(importSwitch.disabled).toBe(false)
  })

  it('only turns the checklist on when the import toggle is turned off', async () => {
    const { producer, consumer } = buildFactories()
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLInputElement>('#linked-tick-switch')!.click()
    await flushPromises()
    button('linked-tick-apply')!.click()
    await flushPromises()

    expect(consumer.inputs[0].completed).toBeFalsy()
    expect(consumer.checklistEnabled).toBe(true)
  })

  it('leaves the destination alone when cancelled', async () => {
    const { producer, consumer } = buildFactories()
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    button('linked-tick-cancel')!.click()
    await flushPromises()

    expect(producer.checklistExports['2:IronIngot']).toBe(true)
    expect(consumer.inputs[0].completed).toBeFalsy()
    expect(consumer.checklistEnabled).toBe(false)
    expect(useLinkedTick().pending.value).toBeNull()
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
    button('linked-tick-apply')!.click()
    await flushPromises()
    expect(consumer.inputs[0].completed).toBe(true)

    await tick(satisfaction).trigger('click')
    await flushPromises()
    expect(dialogText()).toContain('Also untick the import?')
    button('linked-tick-apply')!.click()
    await flushPromises()

    expect(producer.checklistExports['2:IronIngot']).toBe(false)
    expect(consumer.inputs[0].completed).toBe(false)
  })

  it('does not ask when the import already matches and its checklist is on', async () => {
    const { producer, consumer } = buildFactories()
    consumer.inputs[0].completed = true
    consumer.checklistEnabled = true
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()

    expect(useLinkedTick().pending.value).toBeNull()
  })

  it('does not ask when a click only re-confirms a desynced export', async () => {
    const { producer, consumer } = buildFactories()
    producer.checklistExports['2:IronIngot'] = true
    producer.checklistExportSyncedAmounts['2:IronIngot'] = 400
    const { satisfaction } = mountAll(producer, consumer)

    await tick(satisfaction).trigger('click')
    await flushPromises()

    expect(producer.checklistExportSyncedAmounts['2:IronIngot']).toBe(500)
    expect(useLinkedTick().pending.value).toBeNull()
  })

  describe('ticking an import', () => {
    it('offers to tick the export from the Imports table, and does so with its amount', async () => {
      const { producer, consumer } = buildFactories()
      consumer.checklistEnabled = true
      const { imports } = mountAll(producer, consumer)

      await tick(imports).trigger('click')
      await flushPromises()

      expect(consumer.inputs[0].completed).toBe(true)
      expect(dialogText()).toContain('Also tick the export?')
      expect(dialogText()).toContain('Also mark as exported')
      expect(dialogText()).toContain('Iron Ingots')
      // The producer's checklist is already on, so there is nothing to offer there.
      expect(dialogText()).not.toContain('Turn on the checklist')
      expect(producer.checklistExports['2:IronIngot']).toBeFalsy()

      button('linked-tick-apply')!.click()
      await flushPromises()

      expect(producer.checklistExports['2:IronIngot']).toBe(true)
      expect(producer.checklistExportSyncedAmounts['2:IronIngot']).toBe(500)
    })

    it('offers the same from the Checklist panel, with the source checklist when it is off', async () => {
      const { producer, consumer } = buildFactories()
      producer.checklistEnabled = false
      consumer.checklistEnabled = true
      const { consumerChecklist } = mountAll(producer, consumer)

      const importsGroup = consumerChecklist.findAll('.checklist-group')
        .find(group => group.find('.checklist-group-title').text() === 'Imports')!
      await importsGroup.find('input.checklist-tick').trigger('click')
      await flushPromises()

      expect(dialogText()).toContain('Also tick the export?')
      expect(dialogText()).toContain('Turn on the checklist for')

      button('linked-tick-apply')!.click()
      await flushPromises()

      expect(producer.checklistExports['2:IronIngot']).toBe(true)
      expect(producer.checklistEnabled).toBe(true)
    })

    it('offers to untick the export when the import is unticked', async () => {
      const { producer, consumer } = buildFactories()
      consumer.checklistEnabled = true
      consumer.inputs[0].completed = true
      producer.checklistExports['2:IronIngot'] = true
      const { imports } = mountAll(producer, consumer)

      await tick(imports).trigger('click')
      await flushPromises()

      expect(dialogText()).toContain('Also untick the export?')
      button('linked-tick-apply')!.click()
      await flushPromises()

      expect(producer.checklistExports['2:IronIngot']).toBe(false)
    })

    it('does not ask when the export already matches', async () => {
      const { producer, consumer } = buildFactories()
      consumer.checklistEnabled = true
      producer.checklistExports['2:IronIngot'] = true
      const { imports } = mountAll(producer, consumer)

      await tick(imports).trigger('click')
      await flushPromises()

      expect(consumer.inputs[0].completed).toBe(true)
      expect(useLinkedTick().pending.value).toBeNull()
    })
  })
})
