import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAPS } from 'common'

import eventBus from '@/utils/eventBus'
import { canAddFactory, MAX_FACTORIES_PER_PLAN, planIsFull, planIsNearCap, planIsOverCap } from '@/utils/plan-size'

describe('plan-size', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // One number, read by both ends: a planner that let a plan grow past what the server
  // takes would only find out when the plan stopped syncing.
  it('caps a plan at the server cap', () => {
    expect(MAX_FACTORIES_PER_PLAN).toBe(CAPS.factoriesPerRoom)
    expect(MAX_FACTORIES_PER_PLAN).toBe(300)
  })

  it('tells near, full and over apart', () => {
    expect(planIsNearCap(269)).toBe(false)
    expect(planIsNearCap(270)).toBe(true)
    expect(planIsFull(299)).toBe(false)
    expect(planIsFull(300)).toBe(true)
    expect(planIsOverCap(300)).toBe(false)
    expect(planIsOverCap(301)).toBe(true)
  })

  it('allows an add up to the cap and refuses the one past it, with a toast', () => {
    const emit = vi.spyOn(eventBus, 'emit')

    expect(canAddFactory(299)).toBe(true)
    expect(emit).not.toHaveBeenCalled()

    expect(canAddFactory(300)).toBe(false)
    expect(emit).toHaveBeenCalledWith('toast', expect.objectContaining({ type: 'warning' }))
  })

  it('judges a batch by everything it adds', () => {
    vi.spyOn(eventBus, 'emit')
    expect(canAddFactory(290, 10)).toBe(true)
    expect(canAddFactory(290, 11)).toBe(false)
  })

  // A plan that arrived over the cap can still be edited; only growing it is refused.
  it('lets a change that adds nothing through on a plan already over the cap', () => {
    expect(canAddFactory(320, 0)).toBe(true)
  })
})
