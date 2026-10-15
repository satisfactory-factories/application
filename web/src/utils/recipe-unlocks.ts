import { shallowRef } from 'vue'
import { CAPS } from 'common'
import type { RecipeUnlocks, RecipeUnlocksSave } from '@/interfaces/planner/FactoryInterface'
import type { WorldSnapshot } from '@/utils/game-save/world-snapshot'

/**
 * Which alternate recipes the player has unlocked, as read from their save.
 *
 * A LEAF: status.ts reads the plan on screen through `isActiveRecipeLocked`, and status.ts must not
 * reach anything that imports factory.ts. The app store keeps the active state current.
 */

/**
 * The save names an alternate `Alternate_Screw` like the game data does, and the parser strips the
 * prefix into its own list. A few alternates carry no prefix at all (Pure Aluminum Ingot), so the
 * standard list is searched too rather than trusting the prefix.
 */
export const unlockedAlternatesFromWorld = (world: WorldSnapshot, alternateIds: Iterable<string>): string[] => {
  const available = new Set([
    ...world.recipes.alternates.map(id => `Alternate_${id}`),
    ...world.recipes.standard,
  ])
  return [...alternateIds].filter(id => available.has(id)).sort()
}

export const saveFromWorld = (world: WorldSnapshot, alternateIds: Iterable<string>): RecipeUnlocksSave => ({
  name: world.saveName.slice(0, CAPS.name),
  readAt: world.readAt,
  alternates: unlockedAlternatesFromWorld(world, alternateIds),
})

// No save means nothing is locked: the planner behaves as it did before saves could be read.
export const isAlternateUnlocked = (unlocks: RecipeUnlocks | undefined, recipeId: string): boolean => {
  if (!unlocks?.save) return true
  return unlocks.overrides[recipeId] ?? unlocks.save.alternates.includes(recipeId)
}

export const isAlternateOverridden = (unlocks: RecipeUnlocks | undefined, recipeId: string): boolean =>
  !!unlocks?.save && unlocks.overrides[recipeId] !== undefined

// Marks made by hand outlive the save they were made against; a newer save only moves the rest.
export const withSave = (unlocks: RecipeUnlocks | undefined, save: RecipeUnlocksSave): RecipeUnlocks => ({
  save,
  overrides: { ...unlocks?.overrides },
})

/**
 * Flips one alternate. A mark that agrees with the save is dropped rather than stored, so the next
 * save gets to decide that recipe again.
 */
export const toggleAlternate = (unlocks: RecipeUnlocks, recipeId: string): RecipeUnlocks => {
  const unlocked = !isAlternateUnlocked(unlocks, recipeId)
  const overrides = { ...unlocks.overrides }

  if (unlocked === (unlocks.save?.alternates.includes(recipeId) ?? true)) delete overrides[recipeId]
  else overrides[recipeId] = unlocked

  return { ...unlocks, overrides }
}

interface ActiveRecipeUnlocks {
  unlocks: RecipeUnlocks
  alternates: ReadonlySet<string>
}

const active = shallowRef<ActiveRecipeUnlocks | null>(null)

export const setActiveRecipeUnlocks = (unlocks: RecipeUnlocks | undefined, alternates: ReadonlySet<string>) => {
  active.value = unlocks?.save ? { unlocks, alternates } : null
}

// Standard recipes are never locked here: the save's milestones decide those, and that is not modelled yet.
export const isActiveRecipeLocked = (recipeId: string): boolean => {
  const state = active.value
  return !!state && state.alternates.has(recipeId) && !isAlternateUnlocked(state.unlocks, recipeId)
}

/**
 * What a plan arriving without a save leaves on a tab that had one. Absent means "unchanged" on
 * the sync wire, so the forgetting has to be stated or collaborators keep the old save.
 */
export const unlocksForArrivingPlan = (
  arriving: RecipeUnlocks | undefined,
  current: RecipeUnlocks | undefined
): RecipeUnlocks | undefined => arriving ?? (current ? { save: null, overrides: {} } : undefined)
