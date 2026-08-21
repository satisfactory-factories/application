import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/stores/app-store'
import { clampTier, DEFAULT_DEPOT_TIER, MAX_DEPOT_TIER, useDepotResearch } from '@/composables/useDepotResearch'
import eventBus from '@/utils/eventBus'

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
  // Neither level touches a factory, and the local save and the cloud dirty flag both hang off
  // factory events. Without this a level set here looks right in this browser forever and never
  // reaches the account, so the same plan opened elsewhere quietly has the old research.
  describe('marking the plan as edited', () => {
    it.each([
      ['upload', (research: ReturnType<typeof useDepotResearch>) => { research.depotTier.value = 1 }],
      ['expansion', (research: ReturnType<typeof useDepotResearch>) => { research.depotExpansionTier.value = 1 }],
    ])('emits planUpdated when the %s level changes', (_label, setLevel) => {
      const planUpdated = vi.fn()
      eventBus.on('planUpdated', planUpdated)
      const research = useDepotResearch()

      setLevel(research)

      expect(planUpdated).toHaveBeenCalledTimes(1)
      eventBus.off('planUpdated', planUpdated)
    })

    // A re-render writing the same level back would otherwise leave the plan permanently unsaved,
    // because every write would re-arm the dirty flag the sync had just cleared.
    it('says nothing when the level is written back unchanged', () => {
      const research = useDepotResearch()
      research.depotTier.value = 2
      research.depotExpansionTier.value = 2

      const planUpdated = vi.fn()
      eventBus.on('planUpdated', planUpdated)
      research.depotTier.value = 2
      research.depotExpansionTier.value = 2

      expect(planUpdated).not.toHaveBeenCalled()
      eventBus.off('planUpdated', planUpdated)
    })
  })

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
