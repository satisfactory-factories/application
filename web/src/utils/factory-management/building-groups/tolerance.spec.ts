// The balance tolerance decides whether a plan reads green or red, so the figures here are the
// user-visible contract rather than an implementation detail.

import { afterEach, describe, expect, it } from 'vitest'
import { balanceTolerance, isWithinBalanceTolerance } from '@/utils/factory-management/building-groups/tolerance'
import { usePlannerOptions } from '@/composables/usePlannerOptions'

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
})
