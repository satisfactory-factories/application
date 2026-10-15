import { computed } from 'vue'
import type { RecipeUnlocks, RecipeUnlocksSave } from '@/interfaces/planner/FactoryInterface'
import { useAppStore } from '@/stores/app-store'
import { markTabEdited } from '@/utils/sync-intent'
import { isAlternateOverridden, isAlternateUnlocked, toggleAlternate, withSave } from '@/utils/recipe-unlocks'

/**
 * The alternates the active plan's save has unlocked, and the marks made by hand on top.
 *
 * Held on the tab, like the depot tiers: it describes the world the plan is written against, so it
 * travels with the plan to every device it syncs to.
 */
export const useRecipeUnlocks = () => {
  const appStore = useAppStore()

  const unlocks = computed(() => appStore.getCurrentTab()?.recipeUnlocks)
  const save = computed<RecipeUnlocksSave | null>(() => unlocks.value?.save ?? null)

  const write = (next: RecipeUnlocks) => {
    const tab = appStore.getCurrentTab()
    if (!tab) return

    tab.recipeUnlocks = next
    appStore.markPlanEdited()
    markTabEdited('recipeUnlocks')
  }

  return {
    save,
    overrides: computed(() => unlocks.value?.overrides ?? {}),
    isUnlocked: (recipeId: string) => isAlternateUnlocked(unlocks.value, recipeId),
    isOverridden: (recipeId: string) => isAlternateOverridden(unlocks.value, recipeId),
    toggle: (recipeId: string) => {
      if (unlocks.value?.save) write(toggleAlternate(unlocks.value, recipeId))
    },
    loadSave: (next: RecipeUnlocksSave) => write(withSave(unlocks.value, next)),
    // A clean slate: the marks made by hand go with the save they were made against.
    forgetSave: () => write({ save: null, overrides: {} }),
  }
}
