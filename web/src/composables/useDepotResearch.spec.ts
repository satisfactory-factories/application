import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/stores/app-store'
import { clampTier, DEFAULT_DEPOT_TIER, MAX_DEPOT_TIER, useDepotResearch } from '@/composables/useDepotResearch'

// The two levels live on the tab, and both the Dimensional Depot section and the Mercer Sphere
// statistics table read and write them through this composable. A level set in one has to be the
// level the other shows, so what is under test is that the composable holds no state of its own.
describe('useDepotResearch', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useAppStore().getFactories()
  })

  it('reads an unset level as fully researched', () => {
    const { depotTier, depotExpansionTier } = useDepotResearch()

    expect(depotTier.value).toBe(DEFAULT_DEPOT_TIER)
    expect(depotExpansionTier.value).toBe(DEFAULT_DEPOT_TIER)
  })

  it('shows a level set through one caller to every other caller', () => {
    const statistics = useDepotResearch()
    const depotSection = useDepotResearch()

    statistics.depotTier.value = 1
    depotSection.depotExpansionTier.value = 2

    expect(depotSection.depotTier.value).toBe(1)
    expect(statistics.depotExpansionTier.value).toBe(2)
    // And the figures each side reports move with it.
    expect(depotSection.depotRate.value).toBe(30)
    expect(statistics.depotStacks.value).toBe(3)
  })

  it('writes the level onto the tab, so it travels with the plan', () => {
    useDepotResearch().depotTier.value = 0

    expect(useAppStore().getCurrentTab()?.depotUploadTier).toBe(0)
  })

  // Rounds rather than truncates, and anything unreadable falls back to fully researched, which
  // is what an absent level means everywhere else.
  it.each([
    [-1, 0],
    [MAX_DEPOT_TIER + 3, MAX_DEPOT_TIER],
    [2.7, 3],
    [2.2, 2],
    [Number.NaN, DEFAULT_DEPOT_TIER],
    ['', DEFAULT_DEPOT_TIER],
    [null, DEFAULT_DEPOT_TIER],
  ])('clamps %s to %s', (typed, expected) => {
    expect(clampTier(typed)).toBe(expected)
  })
})
