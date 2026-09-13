/**
 * Which planner features a plan uses, for the utilisation gauges.
 *
 * Read off the plan as stored and never written on edit. Defensive throughout: `Room.factories`
 * is a Mixed field, so an old or hand-edited document can hold anything, and one bad plan must
 * never fail the reload that feeds every gauge. Anything missing, null or wrong-typed reads as
 * "not used", and a factory that is not an object is skipped.
 */
export const PLAN_FEATURES = [
  'sink',
  'depot',
  'power_target',
  'groups',
  'checklist',
  'notes',
  'tasks',
  'somersloops',
  'overclocking',
  'custom_buildings',
  'power_producers',
] as const

export type PlanFeature = typeof PLAN_FEATURES[number]

export type FeatureCounts = Record<PlanFeature, number>

export interface PlanFeatureUsage {
  /** Whether the plan uses each feature at all. */
  plan: Record<PlanFeature, boolean>
  /** How many of the plan's factories use each. Plan-level features count zero here. */
  factories: FeatureCounts
  /** Factories that were objects and therefore inspected. */
  factoryCount: number
}

export const emptyFeatureCounts = (): FeatureCounts =>
  Object.fromEntries(PLAN_FEATURES.map(feature => [feature, 0])) as FeatureCounts

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const nonEmptyArray = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0

const positive = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value > 0

/** Building groups sit under products and under power producers; both are searched. */
const buildingGroups = (factory: Record<string, unknown>): Record<string, unknown>[] => {
  const groups: Record<string, unknown>[] = []
  for (const key of ['products', 'powerProducers']) {
    const owners = factory[key]
    if (!Array.isArray(owners)) continue
    for (const owner of owners) {
      if (!isObject(owner) || !Array.isArray(owner.buildingGroups)) continue
      for (const group of owner.buildingGroups) if (isObject(group)) groups.push(group)
    }
  }
  return groups
}

const disposes = (factory: Record<string, unknown>, field: 'sinks' | 'depots'): boolean => {
  if (!isObject(factory.partDisposal)) return false
  return Object.values(factory.partDisposal).some(entry => isObject(entry) && positive(entry[field]))
}

/** Per-factory features. The plan-level ones (`power_target`, `groups`) are decided by the caller. */
export const factoryFeatures = (factory: unknown): Record<PlanFeature, boolean> | null => {
  if (!isObject(factory)) return null
  const groups = buildingGroups(factory)

  return {
    sink: disposes(factory, 'sinks'),
    depot: disposes(factory, 'depots'),
    power_target: false,
    groups: isObject(factory.group),
    checklist: factory.checklistEnabled === true,
    notes: typeof factory.notes === 'string' && factory.notes.trim().length > 0,
    tasks: nonEmptyArray(factory.tasks),
    somersloops: groups.some(group => positive(group.somersloops)),
    overclocking: groups.some(group =>
      typeof group.overclockPercent === 'number' &&
      Number.isFinite(group.overclockPercent) &&
      group.overclockPercent !== 100),
    custom_buildings: nonEmptyArray(factory.customBuildings),
    power_producers: nonEmptyArray(factory.powerProducers),
  }
}

/**
 * One plan's usage. `plan` is the shape a room or a tab shares: its factories, its power
 * target and its groups; nothing else is read.
 */
export const planFeatureUsage = (plan: unknown): PlanFeatureUsage => {
  const factories = emptyFeatureCounts()
  const usage: PlanFeatureUsage = {
    plan: Object.fromEntries(PLAN_FEATURES.map(feature => [feature, false])) as Record<PlanFeature, boolean>,
    factories,
    factoryCount: 0,
  }
  if (!isObject(plan)) return usage

  usage.plan.power_target = positive(plan.powerTarget)
  usage.plan.groups = nonEmptyArray(plan.groups)

  if (!Array.isArray(plan.factories)) return usage
  for (const factory of plan.factories) {
    const features = factoryFeatures(factory)
    if (features === null) continue
    usage.factoryCount++
    for (const feature of PLAN_FEATURES) {
      if (!features[feature]) continue
      factories[feature]++
      usage.plan[feature] = true
    }
  }
  return usage
}
