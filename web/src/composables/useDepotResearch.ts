import { computed } from 'vue'
import { useAppStore } from '@/stores/app-store'
import { markTabEdited } from '@/utils/sync-intent'

/**
 * How far the player has taken the MAM's Dimensional Depot upload-speed research.
 *
 * The rate starts at 15/min and doubles with each of the four upgrades, so an Uploader in a fresh
 * save moves a sixteenth of what a fully-researched one does. Without this the planner could only
 * report the best case, which is the wrong answer for most of a playthrough.
 *
 * Held per plan on the active factory tab, exactly like `powerTarget`: it describes the world the
 * plan is written against, so it has to travel with the plan on save, load and share rather than
 * following the browser to somebody else's save.
 *
 * Sources: https://satisfactory.wiki.gg/wiki/Dimensional_Depot_Uploader for the rates, and the
 * Alien Technology chain on https://satisfactory.wiki.gg/wiki/MAM for what each node costs.
 */
export interface DepotUploadTier {
  tier: number
  rate: number // items/min per Uploader
  label: string
  // Mercer Spheres the MAM asks for to reach this tier from the one below.
  mercerSpheres: number
}

export const DEPOT_UPLOAD_TIERS: DepotUploadTier[] = [
  { tier: 0, rate: 15, label: 'Not researched', mercerSpheres: 0 },
  { tier: 1, rate: 30, label: 'Upgrade 1', mercerSpheres: 3 },
  { tier: 2, rate: 60, label: 'Upgrade 2', mercerSpheres: 7 },
  { tier: 3, rate: 120, label: 'Upgrade 3', mercerSpheres: 13 },
  { tier: 4, rate: 240, label: 'Upgrade 4', mercerSpheres: 23 },
]

export const MAX_DEPOT_TIER = DEPOT_UPLOAD_TIERS.length - 1

/**
 * What the MAM asks for before an Uploader can be built at all: 1 Mercer Sphere for Mercer Sphere
 * Analysis, which gates the chain, and 1 more for the Dimensional Depot node that gives you the
 * building. Paid once per save, and paid whatever upload tier you stop at.
 *
 * The other Alien Technology nodes are deliberately NOT here. Depot Expansion (46 spheres across
 * its four steps) buys stacks of storage, which the planner does not model, and the Manual Depot
 * Uploader (3) is a player convenience with no place in a factory plan. Counting either would
 * charge a plan for research it does not depend on.
 */
export const DEPOT_UNLOCK_MERCER_SPHERES = 2

/**
 * Mercer Spheres spent in the MAM to reach a given upload tier: the two unlock nodes plus every
 * upload upgrade up to and including it. Cumulative, because the upgrades are a chain — you cannot
 * buy 240/min without having bought the three below it.
 */
export const mercerSpheresForTier = (tier: number): number =>
  DEPOT_UPLOAD_TIERS
    .slice(0, clampTier(tier) + 1)
    .reduce((total, entry) => total + entry.mercerSpheres, DEPOT_UNLOCK_MERCER_SPHERES)

export const depotTierLabel = (tier: number): string =>
  (DEPOT_UPLOAD_TIERS[clampTier(tier)] ?? DEPOT_UPLOAD_TIERS[MAX_DEPOT_TIER]).label

/**
 * What to call the research spend, which is NOT always what to call the tier. At tier 0 nothing
 * has been upgraded but the two unlock nodes are still paid, and "MAM research (Not researched):
 * 2" reads as a contradiction of itself.
 */
export const depotResearchLabel = (tier: number): string =>
  clampTier(tier) === 0 ? 'unlock only' : depotTierLabel(tier)

/**
 * Depot Expansion: how many stacks of each item the Depot holds. Same four-step chain and the same
 * prices as the upload upgrades, bought separately.
 *
 * Changes no calculation. The planner tracks rates, not how full a container is, so this exists to
 * cost the research, and because "the Depot is finite" is the whole reason a depot count does not
 * clear a backlog.
 */
export interface DepotExpansionTier {
  tier: number
  stacks: number
  mercerSpheres: number
}

export const DEPOT_EXPANSION_TIERS: DepotExpansionTier[] = [
  { tier: 0, stacks: 1, mercerSpheres: 0 },
  { tier: 1, stacks: 2, mercerSpheres: 3 },
  { tier: 2, stacks: 3, mercerSpheres: 7 },
  { tier: 3, stacks: 4, mercerSpheres: 13 },
  { tier: 4, stacks: 5, mercerSpheres: 23 },
]

export const depotStacksForTier = (tier: number): number =>
  (DEPOT_EXPANSION_TIERS[clampTier(tier)] ?? DEPOT_EXPANSION_TIERS[MAX_DEPOT_TIER]).stacks

export const mercerSpheresForExpansion = (tier: number): number =>
  DEPOT_EXPANSION_TIERS
    .slice(0, clampTier(tier) + 1)
    .reduce((total, entry) => total + entry.mercerSpheres, 0)

// The Manual Depot Uploader node: uploading straight from the pioneer's inventory. A convenience
// rather than anything a factory plan depends on, so it is never assumed, only offered.
export const MANUAL_UPLOADER_MERCER_SPHERES = 3

// Fully researched, because a plan is usually written for where the save is going rather than
// where it is. A plan saved before this existed has no tier at all and gets the same answer the
// statistics gave it then, so nothing a user is already looking at changes value.
export const DEFAULT_DEPOT_TIER = MAX_DEPOT_TIER

export const depotRateForTier = (tier: number): number =>
  (DEPOT_UPLOAD_TIERS[clampTier(tier)] ?? DEPOT_UPLOAD_TIERS[MAX_DEPOT_TIER]).rate

/**
 * Anything outside the four upgrades is meaningless, and a NaN here would make every capacity
 * figure in the section NaN.
 *
 * Empty values are handled BEFORE the numeric coercion, deliberately: `Number(null)` and
 * `Number('')` are both 0, and 0 is a real tier here — the unresearched 15/min. A cleared select
 * would otherwise read as "no research bought" and quietly divide every capacity figure by
 * sixteen, which looks like a plan problem rather than a lost setting.
 */
export const clampTier = (tier: unknown): number => {
  if (tier === null || tier === undefined || tier === '') return DEFAULT_DEPOT_TIER

  const value = Math.round(Number(tier))
  if (!Number.isFinite(value)) return DEFAULT_DEPOT_TIER
  return Math.min(MAX_DEPOT_TIER, Math.max(0, value))
}

export const useDepotResearch = () => {
  const appStore = useAppStore()

  const depotTier = computed<number>({
    get () {
      const tab = appStore.getCurrentTab()
      return tab?.depotUploadTier == null ? DEFAULT_DEPOT_TIER : clampTier(tab.depotUploadTier)
    },
    set (value) {
      const tab = appStore.getCurrentTab()
      if (!tab) return

      const clamped = clampTier(value)
      // Only when it actually moved: every write marks the account copy dirty, and a re-render
      // writing the same level back would keep the plan permanently unsaved.
      if (tab.depotUploadTier === clamped) return

      tab.depotUploadTier = clamped
      // This is tab-level state, so nothing else marks it for saving. See markPlanEdited.
      appStore.markPlanEdited()
      // And nothing else declares it to a room either: the tier travels with the plan, so a
      // rebase that never heard of it would take a peer's tier back over the one just set.
      markTabEdited('depotUploadTier')
    },
  })

  const depotRate = computed<number>(() => depotRateForTier(depotTier.value))
  const depotResearchSpheres = computed<number>(() => mercerSpheresForTier(depotTier.value))
  const depotTierName = computed<string>(() => depotTierLabel(depotTier.value))
  const depotResearchName = computed<string>(() => depotResearchLabel(depotTier.value))

  const depotExpansionTier = computed<number>({
    get () {
      const tab = appStore.getCurrentTab()
      return tab?.depotExpansionTier == null ? DEFAULT_DEPOT_TIER : clampTier(tab.depotExpansionTier)
    },
    set (value) {
      const tab = appStore.getCurrentTab()
      if (!tab) return

      const clamped = clampTier(value)
      if (tab.depotExpansionTier === clamped) return

      tab.depotExpansionTier = clamped
      appStore.markPlanEdited()
      markTabEdited('depotExpansionTier')
    },
  })

  const depotStacks = computed<number>(() => depotStacksForTier(depotExpansionTier.value))
  const depotExpansionSpheres = computed<number>(() => mercerSpheresForExpansion(depotExpansionTier.value))

  return {
    depotTier,
    depotRate,
    depotResearchSpheres,
    depotTierName,
    depotResearchName,
    depotExpansionTier,
    depotStacks,
    depotExpansionSpheres,
  }
}
