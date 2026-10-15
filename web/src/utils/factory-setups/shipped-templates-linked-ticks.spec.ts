import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app-store'
import { findDesyncedLinkedTicks } from '@/utils/factory-management/checklist'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { createMiningDemoPlan } from '@/utils/factory-setups/mining-demo-plan'
import { createSimple } from '@/utils/factory-setups/simple-plan'
import { TemplatePlan } from '@/utils/factory-setups/template-plan'

// The non-debug rows in Templates.vue. A template with an export and the import it feeds ticked
// at only one end opens straight into the "Imports and exports out of sync" dialog, so none may
// ship that way. Loaded through the store so the factories carry the same load-time defaults the
// dialog sees.
//
// The MegaPlan is left out: it is Matt's own save, pasted in as exported, and carries his own
// half-ticked links (mostly imports ticked from mines with the checklist off).
const shipped: [string, () => TemplatePlan][] = [
  ['Demo', complexDemoPlan],
  ['Mining', createMiningDemoPlan],
  ['Simple', createSimple],
]

describe('Shipped templates', () => {
  beforeEach(() => {
    localStorage.removeItem('factoryTabs')
    setActivePinia(createPinia())
  })

  it.each(shipped)('%s has no export and import ticked at only one end', (_name, create) => {
    const appStore = useAppStore()
    appStore.setFactories(create().getFactories(), true)

    expect(findDesyncedLinkedTicks(appStore.getFactories())).toEqual([])
  })
})
