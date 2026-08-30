import { ref, watch } from 'vue'

/**
 * Toggles that change how the planner is drawn, written by the Options dialog and the sidebar's
 * global actions.
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
  // Within that row, badge each tile with what the group does with the part: ships it out, uses it
  // up on site, or just makes it. On by default, and only meaningful with showGroupProducts on.
  // See groupProductKinds.
  showGroupProductKinds: boolean
  // Show each sidebar group's power generated, consumed and balance. Off by default: it is three
  // more chips on every group, and power is a question people ask of the plan far more often than
  // of a folder within it.
  showGroupPower: boolean
  // How far an item's building groups may sit from what it asks for before they count as
  // imbalanced, as a percentage of that requirement. See balanceTolerance.
  balanceTolerancePercent: number
  // Flag items whose surplus has no destination, so they will fill the belt and stall the
  // buildings making them. On by default — it is the difference between a plan that runs and one
  // that jams — but switchable, because a plan mid-build has loose ends everywhere and being told
  // about every one of them is nagging rather than help.
  //
  // Note this now turns factories amber, not just chips: willBacklog is a warning tier, so
  // switching it off changes what colour a plan reads as, not merely how much it says. See
  // willBacklog in status.ts for why it earned that tier.
  showBacklogAdvisory: boolean
  // Drop the wide-screen gutters and let the plan fill the window. Off by default: the gutters
  // exist so a factory card doesn't stretch into an unreadable line on a big monitor, but a plan
  // with wide satisfaction tables would rather have the pixels. Only does anything past 2000px —
  // below that the planner already fills the window. See Planner.vue's .full-width rules.
  fullWidth: boolean
}

const DEFAULTS: PlannerOptions = {
  showGroupProducts: true,
  showInternalGroupProducts: false,
  showGroupProductKinds: true,
  showGroupPower: false,
  balanceTolerancePercent: 1,
  showBacklogAdvisory: true,
  fullWidth: false,
}

// A tolerance of zero would paint every plan red and a negative one is meaningless, so a stored
// number is range-checked as well as type-checked — typeof alone lets NaN and Infinity through.
export const TOLERANCE_RANGE = { min: 0.01, max: 25 }

const isValid = (key: keyof PlannerOptions, value: unknown): boolean => {
  if (typeof value !== typeof DEFAULTS[key]) return false
  if (key !== 'balanceTolerancePercent') return true

  const percent = value as number
  return Number.isFinite(percent) && percent >= TOLERANCE_RANGE.min && percent <= TOLERANCE_RANGE.max
}

const restore = (): PlannerOptions => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { ...DEFAULTS }

    // Key by key, so an unknown or wrongly-typed entry falls back to its default rather than
    // taking the whole object down with it.
    return Object.fromEntries(
      Object.entries(DEFAULTS).map(([key, fallback]) =>
        [key, isValid(key as keyof PlannerOptions, stored[key]) ? stored[key] : fallback]
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

/**
 * The only way the tolerance should be written. Returns whether the value was usable.
 *
 * Every control that sets it can produce something that is not a number: a button toggle emits
 * undefined when its selected value is clicked again, and a cleared number field emits null. Both
 * reached the arithmetic as NaN, which is not greater or less than anything — so every group in
 * the plan read imbalanced, and the recalculation that followed wrote that verdict into all of
 * them. Validating only on restore was no help: the damage is done in the session that typed it.
 */
export const setBalanceTolerance = (percent: unknown): boolean => {
  if (!isValid('balanceTolerancePercent', percent)) {
    return false
  }

  options.value.balanceTolerancePercent = percent as number
  return true
}

export const usePlannerOptions = () => options
