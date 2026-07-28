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
})
