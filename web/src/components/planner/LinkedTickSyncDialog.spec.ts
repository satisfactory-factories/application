import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LinkedTickSyncDialog from './LinkedTickSyncDialog.vue'
import { useGameDataStore } from '@/stores/game-data-store'
import { useAppStore } from '@/stores/app-store'
import { newFactory } from '@/utils/factory-management/factory'
import { updateDependency } from '@/utils/factory-management/dependencies'
import { checklistExportKey, isChecklistExportComplete } from '@/utils/factory-management/checklist'
import { linkedTickSyncLeftAsIs } from '@/composables/useLinkedTick'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import eventBus from '@/utils/eventBus'
import { PlanRepairEntry } from '@/utils/factory-management/repair'

// v-dialog teleports its content to the document body, so assertions read from there.
const dialogText = () => document.body.querySelector('.v-overlay-container')?.textContent ?? ''
const button = (id: string) => document.body.querySelector<HTMLElement>(`#${id}`)

const repair: PlanRepairEntry = {
  kind: 'quantity',
  factoryName: 'Phase 3',
  itemName: 'Steel Pipe',
  context: 'Import',
  field: 'Amount',
  before: 225.001,
  after: 225,
}

// Steel MegaFac exports Steel Pipe to SAM Processing; SAM Processing has the import ticked and the
// export is not.
const buildPlan = (): Factory[] => {
  const source = newFactory('Steel MegaFac', 0, 1)
  const destination = newFactory('SAM Processing', 1, 2)
  const input = { factoryId: source.id, outputPart: 'SteelPipe', amount: 225, completed: true }
  destination.inputs.push(input)
  destination.checklistEnabled = true
  updateDependency(destination, source, input)
  return [source, destination]
}

describe('LinkedTickSyncDialog', () => {
  let appStore: ReturnType<typeof useAppStore>
  let factories: Factory[]
  let dialog: ReturnType<typeof mount>

  beforeEach(() => {
    setActivePinia(createPinia())
    useGameDataStore().getGameData()
    document.body.innerHTML = ''
    linkedTickSyncLeftAsIs.clear()
    appStore = useAppStore()
    appStore.planRepairs = []
    factories = buildPlan()
    vi.spyOn(appStore, 'getFactories').mockImplementation(() => factories)
    dialog = mount(LinkedTickSyncDialog, { global: { plugins: [vuetify] }, attachTo: document.body })
  })

  afterEach(() => {
    dialog.unmount()
    vi.restoreAllMocks()
  })

  const isOpen = () => (dialog.vm as unknown as { $: { setupState: { isOpen: boolean } } }).$.setupState.isOpen

  const load = async () => {
    eventBus.emit('loadingCompleted')
    await flushPromises()
  }

  it('lists the out of sync links after a load', async () => {
    await load()

    const text = dialogText()
    expect(text).toContain('Imports and exports out of sync')
    expect(text).toContain('Steel MegaFac')
    expect(text).toContain('SAM Processing')
    expect(text).toContain('Import ticked')
  })

  it('stays closed when every link agrees', async () => {
    factories[1].inputs[0].completed = false
    await load()

    expect(isOpen()).toBe(false)
  })

  it('ticks both ends', async () => {
    await load()
    button('linked-tick-sync-tick')?.click()
    await flushPromises()

    expect(isChecklistExportComplete(factories[0], factories[1].id, 'SteelPipe')).toBe(true)
    expect(factories[1].inputs[0].completed).toBe(true)
  })

  it('unticks both ends', async () => {
    await load()
    button('linked-tick-sync-untick')?.click()
    await flushPromises()

    expect(factories[0].checklistExports[checklistExportKey(factories[1].id, 'SteelPipe')]).toBeFalsy()
    expect(factories[1].inputs[0].completed).toBe(false)
  })

  it('fixes only the selected links, then narrows to the ones still out of sync', async () => {
    const [source, destination] = factories
    const second = newFactory('Phase 3', 2, 3)
    const input = { factoryId: source.id, outputPart: 'SteelPlate', amount: 90, completed: true }
    second.inputs.push(input)
    second.checklistEnabled = true
    updateDependency(second, source, input)
    factories.push(second)
    await load()

    const ticks = [...document.body.querySelectorAll<HTMLInputElement>('.linked-tick-sync-row input')]
    expect(ticks).toHaveLength(2)
    expect(ticks.every(t => t.checked)).toBe(true)
    // Untick the second link, then fix.
    ticks[1].click()
    await flushPromises()
    button('linked-tick-sync-tick')?.click()
    await flushPromises()

    expect(isChecklistExportComplete(source, destination.id, 'SteelPipe')).toBe(true)
    expect(isChecklistExportComplete(source, second.id, 'SteelPlate')).toBe(false)

    // Still open, now listing only the link left, selected and ready for its own fix.
    expect(isOpen()).toBe(true)
    const left = [...document.body.querySelectorAll<HTMLInputElement>('.linked-tick-sync-row input')]
    expect(left).toHaveLength(1)
    expect(left[0].checked).toBe(true)

    button('linked-tick-sync-untick')?.click()
    await flushPromises()

    expect(input.completed).toBe(false)
    expect(isOpen()).toBe(false)
  })

  it('selects by which end is ticked, all or none', async () => {
    const [source, destination] = factories
    source.checklistEnabled = true
    source.checklistExports[checklistExportKey(destination.id, 'Wire')] = true
    destination.inputs.push({ factoryId: source.id, outputPart: 'Wire', amount: 30 })
    await load()

    const checked = () => [...document.body.querySelectorAll<HTMLInputElement>('.linked-tick-sync-row input')]
      .map(t => t.checked)
    expect(dialogText()).toContain('Import ticked, export not')
    expect(dialogText()).toContain('Export ticked, import not')

    button('linked-tick-sync-select-none')?.click()
    await flushPromises()
    expect(checked()).toEqual([false, false])

    button('linked-tick-sync-select-exports')?.click()
    await flushPromises()
    expect(checked()).toEqual([false, true])

    button('linked-tick-sync-select-imports')?.click()
    await flushPromises()
    expect(checked()).toEqual([true, false])

    button('linked-tick-sync-select-all')?.click()
    await flushPromises()
    expect(checked()).toEqual([true, true])
  })

  it('does not raise the same links again once they were left as is', async () => {
    await load()
    button('linked-tick-sync-leave')?.click()
    await flushPromises()
    await load()

    expect(isOpen()).toBe(false)
    expect(factories[1].inputs[0].completed).toBe(true)
  })

  it('waits for the repair dialog to be dismissed first', async () => {
    appStore.planRepairs = [repair]
    await load()

    expect(isOpen()).toBe(false)

    appStore.planRepairs = []
    await flushPromises()

    expect(dialogText()).toContain('Imports and exports out of sync')
  })
})
