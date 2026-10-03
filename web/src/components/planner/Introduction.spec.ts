import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Introduction from './Introduction.vue'
import { useAppStore } from '@/stores/app-store'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

// "Start with a demo plan" swaps the whole plan out, so it owes the same declaration
// the template loader does: the demo's ids are fixed (1-9), so it routinely lands on
// ids the plan already holds, and those carry no structural signal at all.
describe('Component: Introduction demo plan', () => {
  let appStore: ReturnType<typeof useAppStore>

  const mountSubject = () =>
    mount(Introduction, {
      propsData: { source: 'planner' as const },
      global: { plugins: [vuetify] },
    })

  const clickDemo = async () => {
    const subject = mountSubject()
    eventBus.emit('introToggle', true)
    await subject.vm.$nextTick()

    const button = document.querySelector<HTMLElement>('.v-btn--elevated')
    if (!button) throw new Error('Demo button not found')
    button.click()
    await subject.vm.$nextTick()
  }

  const editedIds = (calls: readonly unknown[][]): number[] =>
    calls
      .filter(call => call[0] === 'factoryEdited')
      .map(call => (call[1] as { id: number }).id)

  beforeEach(() => {
    // The component subscribes to `introToggle` and never unsubscribes, and the dialog
    // teleports to the body — so without this the previous case's copy also opens, and
    // its button (bound to the previous pinia) is the one the query finds.
    eventBus.all.clear()
    document.body.innerHTML = ''

    localStorage.clear()
    setActivePinia(createPinia())
    appStore = useAppStore()
    vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('declares every demo factory, including the ids it overwrites', async () => {
    // Ids 1 and 4 are the demo's own, so the replacement carries no structural signal
    // for them; 99 exists only in the outgoing plan.
    appStore.getCurrentTab().factories = [
      newFactory('Mine', 0, 1),
      newFactory('Also mine', 1, 4),
      newFactory('Only mine', 2, 99),
    ]
    appStore.getFactories()

    const emit = vi.spyOn(eventBus, 'emit')
    await clickDemo()

    const declared = new Set(editedIds(emit.mock.calls))
    for (const factory of complexDemoPlan().getFactories()) {
      expect(declared).toContain(factory.id)
    }
    // The record the demo dropped is the user's deletion and is declared too.
    expect(declared).toContain(99)
  })

  it('applies the demo power target as tab intent', async () => {
    const emit = vi.spyOn(eventBus, 'emit')
    await clickDemo()

    expect(emit).toHaveBeenCalledWith('tabEdited', 'powerTarget')
    expect(appStore.getCurrentTab().powerTarget).toBe(complexDemoPlan().powerTarget)
  })
})
