import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import PlanSizeNotice from './PlanSizeNotice.vue'
import { useAppStore } from '@/stores/app-store'
import { MAX_FACTORIES_PER_PLAN } from '@/utils/plan-size'

describe('Component: PlanSizeNotice', () => {
  let appStore: ReturnType<typeof useAppStore>

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    appStore = useAppStore()
  })

  const textAt = (count: number) =>
    mount(PlanSizeNotice, { props: { count }, global: { plugins: [vuetify] } }).text()

  it('stays out of the way of an ordinary plan', () => {
    expect(textAt(40)).toBe('')
  })

  it('counts down as the plan nears the cap', () => {
    expect(textAt(MAX_FACTORIES_PER_PLAN - 10)).toContain(`${MAX_FACTORIES_PER_PLAN - 10} of ${MAX_FACTORIES_PER_PLAN} factories used`)
  })

  it('says a full plan can take no more', () => {
    expect(textAt(MAX_FACTORIES_PER_PLAN)).toContain('factory limit')
  })

  it('tells a local plan over the cap that it cannot be shared or moved to the cloud', () => {
    expect(textAt(MAX_FACTORIES_PER_PLAN + 5)).toContain('cannot be shared or moved to the cloud')
  })

  it('tells a cloud plan over the cap that its changes are not being saved', () => {
    const tab = appStore.getCurrentTab()!
    appStore.setTabState(tab.id, { kind: 'synced' })

    expect(textAt(MAX_FACTORIES_PER_PLAN + 5)).toContain('not being saved to the cloud')
  })
})
