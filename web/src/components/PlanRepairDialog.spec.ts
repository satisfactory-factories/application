import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import PlanRepairDialog from './PlanRepairDialog.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { useAppStore } from '@/stores/app-store'
import { PlanRepairEntry } from '@/utils/factory-management/repair'

const rocketFuelRepair: PlanRepairEntry = {
  factoryName: 'FG TEST',
  itemName: 'Rocket Fuel',
  context: 'Fuel-Powered Generator (Rocket Fuel)',
  field: 'Fuel rate',
  before: 2400.002,
  after: 2400,
}

// v-dialog teleports its content to the document body, so assertions read from there.
const dialogText = () => document.body.textContent ?? ''

describe('PlanRepairDialog', () => {
  let appStore: ReturnType<typeof useAppStore>

  beforeEach(() => {
    document.body.innerHTML = ''
    vuetifyRender(PlanRepairDialog)
    appStore = useAppStore()
    appStore.planRepairs = []
    appStore.isLoaded = false
  })

  it('should stay closed when nothing was repaired', async () => {
    appStore.isLoaded = true
    await nextTick()

    expect(dialogText()).not.toContain('Plan data repaired')
  })

  it('should stay closed until loading has finished', async () => {
    appStore.planRepairs = [rocketFuelRepair]
    await nextTick()

    expect(dialogText()).not.toContain('Plan data repaired')

    appStore.isLoaded = true
    await nextTick()

    expect(dialogText()).toContain('Plan data repaired')
  })

  it('should describe the repair in terms the user recognises', async () => {
    appStore.planRepairs = [rocketFuelRepair]
    appStore.isLoaded = true
    await nextTick()

    const text = dialogText()
    expect(text).toContain('usually to do with micro-rounding')
    expect(text).toContain('FG TEST')
    expect(text).toContain('Rocket Fuel')
    expect(text).toContain('Fuel-Powered Generator (Rocket Fuel)')
    expect(text).toContain('Fuel rate')
    expect(text).toContain('2400.002')
    expect(text).toContain('2400')
  })

  it('should list every repair', async () => {
    appStore.planRepairs = [
      rocketFuelRepair,
      { ...rocketFuelRepair, factoryName: 'Coal plant', itemName: 'Compacted Coal' },
    ]
    appStore.isLoaded = true
    await nextTick()

    expect(dialogText()).toContain('Coal plant')
    expect(dialogText()).toContain('Compacted Coal')
  })

  it('should group a factory\'s items under one heading', async () => {
    appStore.planRepairs = [
      rocketFuelRepair,
      { ...rocketFuelRepair, itemName: 'Compacted Coal', before: 3000.003, after: 3000 },
      { ...rocketFuelRepair, factoryName: 'Steel plant', itemName: 'Iron Plate' },
    ]
    appStore.isLoaded = true
    await nextTick()

    const headings = [...document.querySelectorAll('h3')].map(h => h.textContent?.trim())
    expect(headings).toEqual(['FG TEST', 'Steel plant'])

    // Both of FG TEST's items sit in its list, not repeated under their own headings
    const lists = document.querySelectorAll('.repair-list')
    expect(lists).toHaveLength(2)
    expect(lists[0].querySelectorAll('li')).toHaveLength(2)
    expect(lists[1].querySelectorAll('li')).toHaveLength(1)
  })

  it('should colour the old value as an error and the new one as a success', async () => {
    appStore.planRepairs = [rocketFuelRepair]
    appStore.isLoaded = true
    await nextTick()

    expect(document.querySelector('.repair-before')?.textContent).toBe('2400.002')
    expect(document.querySelector('.repair-after')?.textContent).toBe('2400')
  })
})
