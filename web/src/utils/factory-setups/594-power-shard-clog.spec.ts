import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { create594Scenario } from '@/utils/factory-setups/594-power-shard-clog'
import { setSinkCount } from '@/utils/factory-management/disposal'
import { getFactoryStatuses, isUnhandledByproduct, willBacklog } from '@/utils/factory-management/status'
import { usePlannerOptions } from '@/composables/usePlannerOptions'

// https://github.com/satisfactory-factories/application/issues/594
//
// Power Shards produce Dark Matter Residue as an unavoidable byproduct, and neither output has
// anywhere to go in this plan: the residue is a fluid (never sinkable), and the shards themselves
// cannot be sunk in game either, even though they are an ordinary solid. Before the fix, the
// planner treated the shards as sinkable, so setting a sink on them silently zeroed the surplus
// instead of continuing to warn about it.
describe('594 Power Shard clog scenario', () => {
  let factories: Factory[]
  let factory: Factory

  beforeEach(() => {
    usePlannerOptions().value.showBacklogAdvisory = true
    const templateInstance = create594Scenario()
    factories = templateInstance.getFactories()
    factory = findFacByName('Alen Power Factory', factories)
    calculateFactories(factories, gameData)
  })

  it('produces Power Shards and their Dark Matter Residue byproduct', () => {
    expect(factory.products).toHaveLength(1)
    expect(factory.products[0].id).toBe('CrystalShard')
    expect(factory.products[0].amount).toBe(25)
    expect(factory.byProducts).toEqual([
      expect.objectContaining({ id: 'DarkEnergy', amount: 300 }),
    ])
  })

  it('marks the Power Shard surplus as not sinkable', () => {
    expect(factory.parts.CrystalShard.isSinkable).toBe(false)
    // 25/min made, 10/min exported to the Power Augmenters: 15/min surplus, matching the plan
    // linked from the issue ("15+ surplus of shards").
    expect(factory.parts.CrystalShard.amountRemaining).toBe(15)
  })

  it('keeps the surplus even once a sink is set on the shards', () => {
    setSinkCount(factory, 'CrystalShard', 3)
    calculateFactories(factories, gameData)

    expect(factory.parts.CrystalShard.amountRequiredSink).toBe(0)
    expect(factory.parts.CrystalShard.amountRemaining).toBe(15)
  })

  it('flags the Power Shard surplus as a backlog that will clog the factory', () => {
    expect(willBacklog(factory, 'CrystalShard')).toBe(true)

    const statuses = getFactoryStatuses(factory)
    const backlog = statuses.find(status => status.type === 'willBacklog')
    expect(backlog).toBeDefined()
    expect(backlog!.subjects).toEqual(
      expect.arrayContaining([{ id: 'CrystalShard', type: 'item' }])
    )
  })

  // Setting a sink used to make this vanish, because the engine wrongly zeroed the surplus.
  it('still flags the backlog once a (useless) sink is set on the shards', () => {
    setSinkCount(factory, 'CrystalShard', 3)
    calculateFactories(factories, gameData)

    expect(willBacklog(factory, 'CrystalShard')).toBe(true)
  })

  it('flags the Dark Matter Residue byproduct as unhandled, being a fluid', () => {
    expect(factory.parts.DarkEnergy.isSinkable).toBe(false)
    expect(isUnhandledByproduct(factory, 'DarkEnergy')).toBe(true)

    const statuses = getFactoryStatuses(factory)
    const unhandled = statuses.find(status => status.type === 'unhandledByproduct')
    expect(unhandled).toBeDefined()
    expect(unhandled!.subjects).toEqual(
      expect.arrayContaining([{ id: 'DarkEnergy', type: 'item' }])
    )
  })
})
