// The balance tolerance decides whether a plan reads green or red, so the figures here are the
// user-visible contract rather than an implementation detail.

import { afterEach, describe, expect, it } from 'vitest'
import { balanceTolerance, isWithinBalanceTolerance } from '@/utils/factory-management/building-groups/tolerance'
import { usePlannerOptions } from '@/composables/usePlannerOptions'
import { ItemType } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { refreshBuildingGroupProblems } from '@/utils/factory-management/building-groups/common'
import { calculateBuildingGroupProblems } from '@/utils/factory-management/building-groups/common'

const setTolerance = (percent: number) => {
  usePlannerOptions().value.balanceTolerancePercent = percent
}

describe('balance tolerance', () => {
  afterEach(() => setTolerance(1))

  it('scales with what the item is asking for', () => {
    // A 360/min Stone mine is 6 effective Miner Mk.1s, so 1% is 0.06 of one — 3.6/min. The flat
    // 0.1 buildings this replaced was 6/min, which read as balanced.
    expect(balanceTolerance(6)).toBeCloseTo(0.06, 6)
    expect(isWithinBalanceTolerance(0.05, 6)).toBe(true)
    expect(isWithinBalanceTolerance(0.07, 6)).toBe(false)
  })

  it('judges a surplus and a shortfall alike', () => {
    expect(isWithinBalanceTolerance(-0.05, 6)).toBe(true)
    expect(isWithinBalanceTolerance(-0.07, 6)).toBe(false)
  })

  it('stops growing past 10 effective buildings', () => {
    // Otherwise 1% of a 100-building factory is a whole building of drift, which is looser than
    // the flat allowance this replaced rather than tighter.
    expect(balanceTolerance(10)).toBeCloseTo(0.1, 6)
    expect(balanceTolerance(100)).toBeCloseTo(0.1, 6)
    expect(balanceTolerance(10_000)).toBeCloseTo(0.1, 6)
  })

  it('follows the configured percentage', () => {
    setTolerance(5)
    expect(balanceTolerance(6)).toBeCloseTo(0.3, 6)
    expect(balanceTolerance(100)).toBeCloseTo(0.5, 6)

    setTolerance(0.1)
    expect(balanceTolerance(6)).toBeCloseTo(0.006, 6)
  })

  it('treats an item that asks for nothing as balanced', () => {
    expect(isWithinBalanceTolerance(0, 0)).toBe(true)
  })

  // The verdict is saved into the plan; the tolerance belongs to the browser. So a plan arriving
  // from a share link, a cloud restore or a paste carries whatever its author's setting made of
  // it, and loading deliberately skips the full recalculation that would correct it.
  describe('a plan judged by someone else', () => {
    // 5 miners at 99.2% against 300/min: 2.4/min short, which is inside 1% and outside 0.5%.
    const shortMine = () => {
      const factory = newFactory('Stone')
      addProductToFactory(factory, { id: 'Stone', amount: 300, recipe: 'Extract_Stone' })
      const product = factory.products[0]
      product.buildingGroupItemSync = false
      product.buildingRequirements = { name: 'minermk1', amount: 5, powerConsumed: 0 }
      product.buildingGroups[0].buildingCount = 5
      product.buildingGroups[0].overclockPercent = 99.2
      return { factory, product }
    }

    it('is re-judged against the tolerance of the browser opening it', () => {
      const { factory, product } = shortMine()

      // As its author left it, on a loose setting.
      setTolerance(5)
      calculateBuildingGroupProblems(product, ItemType.Product)
      expect(product.buildingGroupsHaveProblem).toBe(false)

      // Opened by someone stricter, with no migration to trigger a recalculation.
      setTolerance(0.1)
      refreshBuildingGroupProblems([factory])

      expect(product.buildingGroupsHaveProblem).toBe(true)
      expect(factory.hasProblem).toBe(true)
    })

    it('clears a verdict a stricter author left behind', () => {
      const { factory, product } = shortMine()

      setTolerance(0.1)
      calculateBuildingGroupProblems(product, ItemType.Product)
      expect(product.buildingGroupsHaveProblem).toBe(true)

      setTolerance(5)
      refreshBuildingGroupProblems([factory])

      expect(product.buildingGroupsHaveProblem).toBe(false)
    })
  })
})
