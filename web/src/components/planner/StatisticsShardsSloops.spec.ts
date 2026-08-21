import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StatisticsShardsSloops from './StatisticsShardsSloops.vue'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { DEPOT_UNLOCK_MERCER_SPHERES } from '@/composables/useDepotResearch'

describe('Component: StatisticsShardsSloops', () => {
  const mountSubject = (factories: Factory[] = []) =>
    mount(StatisticsShardsSloops, {
      props: { factories },
      global: { plugins: [vuetify], provide: { navigateToFactory: vi.fn() } },
    })

  beforeEach(() => {
    localStorage.clear()
    // The card is collapsed by default, and a collapsed card renders none of this.
    localStorage.setItem('statisticsShardsSloopsHidden', 'false')
    setActivePinia(createPinia())
  })

  // The MAM research is a once-per-save cost, counted whether or not the plan still has an
  // Uploader in it. Hide the table on the factory count alone and the header chip is left
  // reporting a total that nothing on screen explains, and that nothing on screen can untick.
  describe('a plan with the research counted but no Uploaders left', () => {
    beforeEach(() => {
      localStorage.setItem('statisticsMercerInclude:upload', 'true')
    })

    it('still lists the research it is counting', () => {
      const subject = mountSubject([newFactory('Empty')])

      expect(subject.find('#stats-mercer-research-upload').exists()).toBe(true)
      // Fully researched by default: the two unlock nodes plus all four upgrades.
      expect(subject.find('#stats-mercer-total').text()).toContain(String(DEPOT_UNLOCK_MERCER_SPHERES + 46))
    })

    it('agrees with the header chip', () => {
      const subject = mountSubject([newFactory('Empty')])

      expect(subject.find('#stats-mercer-summary').text())
        .toContain(String(DEPOT_UNLOCK_MERCER_SPHERES + 46))
    })
  })

  it('says the plan has no Uploaders when nothing is counted', () => {
    const subject = mountSubject([newFactory('Empty')])

    expect(subject.find('#stats-mercer-research-upload').exists()).toBe(false)
    expect(subject.text()).toContain('No Dimensional Depot Uploaders in this plan.')
  })
})
