import { shallowRef } from 'vue'
import { CAPS } from 'common'
import { stableStringify } from '@/sync/room-state'
import type { RecipeUnlocks, RecipeUnlocksSave } from '@/interfaces/planner/FactoryInterface'
import type { WorldSnapshot } from '@/utils/game-save/world-snapshot'

/**
 * Which recipes and buildings the player has unlocked, as read from their save.
 *
 * A LEAF: status.ts reads the plan on screen through `isActiveRecipeLocked` and
 * `isActiveBuildingLocked`, and status.ts must not reach anything that imports factory.ts. The app
 * store keeps the active state current.
 */

/**
 * The save names an alternate `Alternate_Screw` like the game data does, and the parser strips the
 * prefix into its own list. Matched against the game data's ids by membership rather than by
 * prefix: Pure Aluminum Ingot is an alternate with no prefix, and `Alternate_Turbofuel` is standard.
 */
export const unlockedRecipesFromWorld = (world: WorldSnapshot, recipeIds: Iterable<string>): string[] => {
  const available = new Set([
    ...world.recipes.alternates.map(id => `Alternate_${id}`),
    ...world.recipes.standard,
  ])
  return [...recipeIds].filter(id => available.has(id)).sort()
}

export const saveFromWorld = (world: WorldSnapshot, recipeIds: Iterable<string>): RecipeUnlocksSave => ({
  name: world.saveName.slice(0, CAPS.name),
  readAt: world.readAt,
  recipes: unlockedRecipesFromWorld(world, recipeIds),
  buildings: [...world.buildings],
  tiers: [...world.progression.tiers],
})

// The planner's own mining and pumping recipes (`Extract_OreIron`). No save lists them, so their
// building decides instead.
export const isLockableRecipe = (recipeId: string): boolean => !recipeId.startsWith('Extract_')

// A save stored before buildings and every recipe were kept reads as no save, rather than as one
// that has unlocked nothing.
const usableSave = (unlocks: RecipeUnlocks | undefined): RecipeUnlocksSave | null =>
  unlocks?.save && Array.isArray(unlocks.save.recipes) && Array.isArray(unlocks.save.buildings) ? unlocks.save : null

export const hasUsableSave = (unlocks: RecipeUnlocks | undefined): boolean => !!usableSave(unlocks)

// No save means nothing is locked: the planner behaves as it did before saves could be read.
export const isRecipeUnlocked = (unlocks: RecipeUnlocks | undefined, recipeId: string): boolean => {
  const save = usableSave(unlocks)
  if (!save || !isLockableRecipe(recipeId)) return true
  return unlocks!.overrides[recipeId] ?? save.recipes.includes(recipeId)
}

export const isRecipeOverridden = (unlocks: RecipeUnlocks | undefined, recipeId: string): boolean =>
  !!usableSave(unlocks) && unlocks!.overrides[recipeId] !== undefined

export const isBuildingUnlocked = (unlocks: RecipeUnlocks | undefined, buildingId: string): boolean => {
  const save = usableSave(unlocks)
  return !save || save.buildings.includes(buildingId)
}

// Marks made by hand outlive the save they were made against; a newer save only moves the rest.
export const withSave = (unlocks: RecipeUnlocks | undefined, save: RecipeUnlocksSave): RecipeUnlocks => ({
  save,
  overrides: { ...unlocks?.overrides },
})

/**
 * Sets one recipe unlocked or locked. A mark that agrees with the save is dropped rather than
 * stored, so the next save gets to decide that recipe again.
 */
export const setRecipeUnlocked = (unlocks: RecipeUnlocks, recipeId: string, unlocked: boolean): RecipeUnlocks => {
  const overrides = { ...unlocks.overrides }

  if (unlocked === (usableSave(unlocks)?.recipes.includes(recipeId) ?? true)) delete overrides[recipeId]
  else overrides[recipeId] = unlocked

  return { ...unlocks, overrides }
}

export const toggleRecipe = (unlocks: RecipeUnlocks, recipeId: string): RecipeUnlocks =>
  setRecipeUnlocked(unlocks, recipeId, !isRecipeUnlocked(unlocks, recipeId))

interface ActiveRecipeUnlocks {
  unlocks: RecipeUnlocks
  recipes: ReadonlySet<string>
  buildings: ReadonlySet<string>
}

const active = shallowRef<ActiveRecipeUnlocks | null>(null)

/** The game data's recipe and building ids bound what can be locked: an unknown id never is. */
export const setActiveRecipeUnlocks = (
  unlocks: RecipeUnlocks | undefined,
  recipes: ReadonlySet<string>,
  buildings: ReadonlySet<string>
) => {
  active.value = usableSave(unlocks) ? { unlocks: unlocks!, recipes, buildings } : null
}

export const isActiveRecipeLocked = (recipeId: string): boolean => {
  const state = active.value
  return !!state && state.recipes.has(recipeId) && !isRecipeUnlocked(state.unlocks, recipeId)
}

export const isActiveBuildingLocked = (buildingId: string): boolean => {
  const state = active.value
  return !!state && state.buildings.has(buildingId) && !isBuildingUnlocked(state.unlocks, buildingId)
}

/**
 * What a plan arriving without a save leaves on a tab that had one. Absent means "unchanged" on
 * the sync wire, so the forgetting has to be stated or collaborators keep the old save.
 */
export const unlocksForArrivingPlan = (
  arriving: RecipeUnlocks | undefined,
  current: RecipeUnlocks | undefined
): RecipeUnlocks | undefined => arriving ?? (current ? { save: null, overrides: {} } : undefined)

/**
 * This client's own changes laid over the server's list, for a rebase. Resending the whole local
 * list would undo a peer's padlock, or put back an older save over a newer one. With no known
 * baseline (null, after a restart) there is nothing to tell mine from theirs, so mine wins whole.
 */
export const rebaseRecipeUnlocks = (
  base: RecipeUnlocks | undefined | null,
  local: RecipeUnlocks,
  server: RecipeUnlocks | undefined
): RecipeUnlocks => {
  if (base === null || server === undefined) return local

  const changedSave = stableStringify(local.save) !== stableStringify(base?.save ?? null)
  const overrides = { ...server.overrides }
  for (const id of new Set([...Object.keys(local.overrides), ...Object.keys(base?.overrides ?? {})])) {
    const mine = local.overrides[id]
    if (mine === base?.overrides[id]) continue
    if (mine === undefined) delete overrides[id]
    else overrides[id] = mine
  }

  return { save: changedSave ? local.save : server.save, overrides }
}
