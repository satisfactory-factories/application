import { describe, expect, it } from 'vitest'

import { PLAN_FEATURES, emptyFeatureCounts, factoryFeatures, planFeatureUsage } from './feature-usage'

const bare = () => ({ id: 1, name: 'Bare', products: [], powerProducers: [] })

const none = () => Object.fromEntries(PLAN_FEATURES.map(feature => [feature, false]))

describe('factoryFeatures', () => {
  it('reads a bare factory as using nothing', () => {
    expect(factoryFeatures(bare())).toEqual(none())
  })

  it('returns null for anything that is not an object', () => {
    for (const junk of [null, undefined, 3, 'factory', [bare()]]) expect(factoryFeatures(junk)).toBeNull()
  })

  it.each([
    ['sink', { partDisposal: { IronIngot: { sinks: 2, depots: 0 } } }],
    ['depot', { partDisposal: { IronIngot: { sinks: 0, depots: 1 } } }],
    ['groups', { group: { id: 'g', name: 'Steel', color: '#fff', order: 0 } }],
    ['checklist', { checklistEnabled: true }],
    ['notes', { notes: 'remember the belts' }],
    ['tasks', { tasks: [{ title: 'build it', completed: false }] }],
    ['custom_buildings', { customBuildings: [{ id: 'p', building: 'portal', amount: 1 }] }],
    ['power_producers', { powerProducers: [{ id: 'g', building: 'generatorcoal' }] }],
    ['somersloops', { products: [{ id: 'IronIngot', buildingGroups: [{ id: 1, somersloops: 2 }] }] }],
    ['overclocking', { products: [{ id: 'IronIngot', buildingGroups: [{ id: 1, overclockPercent: 150 }] }] }],
    ['overclocking', { products: [{ id: 'IronIngot', buildingGroups: [{ id: 1, overclockPercent: 50 }] }] }],
  ])('detects %s', (feature, extra) => {
    expect(factoryFeatures({ ...bare(), ...extra })).toEqual({ ...none(), [feature]: true })
  })

  it('finds somersloops and overclocking under power producers as well as products', () => {
    const factory = { ...bare(), powerProducers: [{ id: 'g', buildingGroups: [{ id: 1, somersloops: 1, overclockPercent: 250 }] }] }

    expect(factoryFeatures(factory)).toEqual({ ...none(), somersloops: true, overclocking: true, power_producers: true })
  })

  it.each([
    ['blank notes', { notes: '   \n' }],
    ['a zero sink count', { partDisposal: { IronIngot: { sinks: 0, depots: 0 } } }],
    ['a negative depot count', { partDisposal: { IronIngot: { sinks: 0, depots: -1 } } }],
    ['a 100% clock', { products: [{ id: 'x', buildingGroups: [{ id: 1, overclockPercent: 100 }] }] }],
    ['a NaN clock', { products: [{ id: 'x', buildingGroups: [{ id: 1, overclockPercent: NaN }] }] }],
    ['a clock stored as a string', { products: [{ id: 'x', buildingGroups: [{ id: 1, overclockPercent: '150' }] }] }],
    ['an empty task list', { tasks: [] }],
    ['a group that is not an object', { group: 'steel' }],
    ['checklistEnabled as a string', { checklistEnabled: 'true' }],
    ['a partDisposal that is an array', { partDisposal: [{ sinks: 3 }] }],
    ['building groups that are not objects', { products: [{ id: 'x', buildingGroups: [3, null, 'x'] }] }],
  ])('reads %s as not used', (_label, extra) => {
    expect(factoryFeatures({ ...bare(), ...extra })).toEqual(none())
  })
})

describe('planFeatureUsage', () => {
  it('counts factories per feature and marks the plan for any of them', () => {
    const usage = planFeatureUsage({
      factories: [
        { ...bare(), checklistEnabled: true, notes: 'a' },
        { ...bare(), checklistEnabled: true },
        bare(),
      ],
    })

    expect(usage.factoryCount).toBe(3)
    expect(usage.factories).toEqual({ ...emptyFeatureCounts(), checklist: 2, notes: 1 })
    expect(usage.plan).toEqual({ ...none(), checklist: true, notes: true })
  })

  it('reads the power target and groups off the plan itself', () => {
    const usage = planFeatureUsage({ powerTarget: 500, groups: [{ id: 'g', name: 'A', color: '#000', order: 0 }], factories: [] })

    expect(usage.plan.power_target).toBe(true)
    expect(usage.plan.groups).toBe(true)
    expect(usage.factories.power_target).toBe(0)
  })

  it.each([
    ['the upload tier', { depotUploadTier: 2 }],
    ['the expansion tier', { depotExpansionTier: 0 }],
    ['both at the maximum', { depotUploadTier: 4, depotExpansionTier: 4 }],
  ])('counts depot settings once %s has been set', (_label, tiers) => {
    const usage = planFeatureUsage({ ...tiers, factories: [bare()] })

    expect(usage.plan.depot_settings).toBe(true)
    expect(usage.factories.depot_settings).toBe(0)
  })

  it.each([
    ['nothing set', {}],
    ['a tier that is not a number', { depotUploadTier: '3' }],
    ['a NaN tier', { depotExpansionTier: NaN }],
    ['null tiers', { depotUploadTier: null, depotExpansionTier: null }],
  ])('does not count depot settings with %s', (_label, tiers) => {
    expect(planFeatureUsage({ ...tiers, factories: [] }).plan.depot_settings).toBe(false)
  })

  it.each([0, -5, NaN, '500', null, undefined])('does not count a power target of %s', target => {
    expect(planFeatureUsage({ powerTarget: target, factories: [] }).plan.power_target).toBe(false)
  })

  it('skips factories that are not objects and never throws on junk', () => {
    const usage = planFeatureUsage({ factories: [null, 4, 'x', bare(), { ...bare(), notes: 'n' }] })

    expect(usage.factoryCount).toBe(2)
    expect(usage.factories.notes).toBe(1)
  })

  it.each([null, undefined, 'plan', [], { factories: 'nope' }, { factories: null }])('reads %s as an empty plan', plan => {
    const usage = planFeatureUsage(plan)

    expect(usage.factoryCount).toBe(0)
    expect(usage.factories).toEqual(emptyFeatureCounts())
    expect(Object.values(usage.plan).every(used => !used)).toBe(true)
  })
})
