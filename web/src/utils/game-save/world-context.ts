/**
 * What the calculation engine asks a world.
 *
 * Pure functions over a snapshot, with no store access, so a pass can call them without changing
 * calculateFactory()'s order. Every one of them answers permissively when there is no world:
 * a plan with no save attached is measured exactly as it was before this existed, so nothing a
 * user already built starts failing the moment the feature ships.
 */

import type { NodeTally, PurityCounts, WorldSnapshot } from '@/utils/game-save/world-snapshot'
import { isPurityComplete } from '@/utils/game-save/world-snapshot'

/** Extractors best-first, so the first available one is the best the world can build. */
const MINERS_BEST_FIRST = ['minermk3', 'minermk2', 'minermk1'] as const

export const hasWorld = (world?: WorldSnapshot): world is WorldSnapshot => world !== undefined

export const isBuildingAvailable = (world: WorldSnapshot | undefined, buildingId: string): boolean =>
  !hasWorld(world) || world.buildings.includes(buildingId)

export const isRecipeAvailable = (world: WorldSnapshot | undefined, recipeId: string): boolean => {
  if (!hasWorld(world)) return true
  return world.recipes.standard.includes(recipeId) || world.recipes.alternates.includes(recipeId)
}

/**
 * The best miner the world can build. Without a world this stays Mk.3, which is what every
 * "at 250%" ceiling in the planner already assumes.
 */
export const bestAvailableMiner = (world?: WorldSnapshot): string | null => {
  if (!hasWorld(world)) return 'minermk3'
  return MINERS_BEST_FIRST.find(miner => world.buildings.includes(miner)) ?? null
}

export interface BaselineNodeCounts {
  nodes?: PurityCounts
  wells?: PurityCounts
}

export interface ResolvedNodeCounts {
  nodes: PurityCounts
  wells: PurityCounts
  // True where the save actually said something, so the UI can distinguish a measured figure
  // from the vanilla assumption.
  fromWorld: boolean
}

const zero = (): PurityCounts => ({ impure: 0, normal: 0, pure: 0 })
const totalOf = (counts: PurityCounts) => counts.impure + counts.normal + counts.pure

/**
 * Scale a baseline purity split to a node count the save states but did not break down.
 *
 * A resource-rich world names the resource of every solid node without touching purity, so we
 * know Coal went from 62 nodes to 101 but not how those 101 split. The vanilla proportions are
 * the only evidence available, so they are stretched to the new total and the remainder is given
 * to the largest bucket rather than lost to rounding.
 */
const scaleToTotal = (baseline: PurityCounts, total: number): PurityCounts => {
  const baseTotal = totalOf(baseline)
  if (baseTotal === 0 || total === 0) return zero()

  const scaled = {
    impure: Math.floor((baseline.impure / baseTotal) * total),
    normal: Math.floor((baseline.normal / baseTotal) * total),
    pure: Math.floor((baseline.pure / baseTotal) * total),
  }

  const largest = (['normal', 'pure', 'impure'] as const)
    .reduce((best, grade) => (baseline[grade] > baseline[best] ? grade : best), 'normal' as const)
  scaled[largest] += total - totalOf(scaled)

  return scaled
}

const resolveTally = (baseline: PurityCounts | undefined, tally: NodeTally | undefined): PurityCounts => {
  const base = baseline ?? zero()
  if (!tally || tally.total === 0) return { ...base }
  // The save gave the whole breakdown, so it simply replaces the baseline.
  if (isPurityComplete(tally)) return { ...tally.purity }
  // It gave a count but no split. Keep the count and borrow the baseline's proportions.
  return scaleToTotal(base, tally.total)
}

/**
 * The node counts for one resource in this world, as a patch over the vanilla table.
 *
 * `baseline` is the hand-typed vanilla entry for that resource. Where the save said nothing, the
 * baseline is returned untouched: a vanilla save carries no overrides at all, and treating its
 * silence as zero would tell the user the map holds nothing.
 */
export const resolveNodeCounts = (
  world: WorldSnapshot | undefined,
  resource: string,
  baseline: BaselineNodeCounts = {},
): ResolvedNodeCounts => {
  const counts = hasWorld(world) ? world.nodes[resource] : undefined

  return {
    nodes: resolveTally(baseline.nodes, counts?.nodes),
    wells: resolveTally(baseline.wells, counts?.wells),
    fromWorld: counts !== undefined,
  }
}
