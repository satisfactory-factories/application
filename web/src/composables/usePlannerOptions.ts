import { ref, watch } from 'vue'

/**
 * Toggles from the Options dialog that change how the planner is drawn.
 *
 * Module scope, not component state: the sidebar is mounted twice at once (docked and drawer) and
 * the dialog that writes these is a third component entirely, so a ref per instance would let the
 * two sidebars disagree. Per browser rather than per plan — these describe how someone likes to
 * read a plan, not anything about the plan itself, so they deliberately do not travel with a share
 * link or a cloud restore.
 */
const STORAGE_KEY = 'plannerOptions'

interface PlannerOptions {
  // Show the row of item tiles under each sidebar group saying what it delivers. On by default.
  showGroupProducts: boolean
  // Within that row, show parts a group produces and consumes entirely within itself. Off by
  // default: the row is meant to say what the folder delivers, and an intermediate that never
  // leaves it crowds that out. Has no effect with showGroupProducts off — see the Options dialog,
  // which disables it. See collectGroupProducts.
  showInternalGroupProducts: boolean
  // Show each sidebar group's power generated, consumed and balance. Off by default: it is three
  // more chips on every group, and power is a question people ask of the plan far more often than
  // of a folder within it.
  showGroupPower: boolean
}

const DEFAULTS: PlannerOptions = {
  showGroupProducts: true,
  showInternalGroupProducts: false,
  showGroupPower: false,
}

const restore = (): PlannerOptions => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { ...DEFAULTS }

    // Key by key, so an unknown or wrongly-typed entry falls back to its default rather than
    // taking the whole object down with it.
    return Object.fromEntries(
      Object.entries(DEFAULTS).map(([key, fallback]) =>
        [key, typeof stored[key] === typeof fallback ? stored[key] : fallback]
      )
    ) as PlannerOptions
  } catch {
    return { ...DEFAULTS }
  }
}

const options = ref<PlannerOptions>(restore())

watch(options, value => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}, { deep: true })

export const usePlannerOptions = () => options
