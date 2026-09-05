import { afterEach, describe, expect, it, vi } from 'vitest'
import { markFactoryRemoved, markPlanReplaced } from '@/utils/sync-intent'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

describe('markPlanReplaced', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('declares what arrived, what went, and an id the replacement reused', () => {
    const emit = vi.spyOn(eventBus, 'emit')
    const outgoing = [newFactory('Overwritten', 0, 1), newFactory('Dropped', 1, 2)]
    const incoming = [newFactory('In its place', 0, 1), newFactory('Brand new', 1, 3)]

    markPlanReplaced(outgoing, incoming)

    for (const factory of [...incoming, outgoing[1]]) {
      expect(emit).toHaveBeenCalledWith('factoryEdited', factory)
      expect(emit).toHaveBeenCalledWith('factoryUpdated', factory)
    }
    // Id 1 is carried by the arrival, never by the record it replaced: announcing the
    // old object too would claim a factory the plan no longer holds.
    expect(emit).not.toHaveBeenCalledWith('factoryEdited', outgoing[0])
  })

  it('treats an emptied plan as every record being removed', () => {
    const emit = vi.spyOn(eventBus, 'emit')
    const cleared = [newFactory('Gone', 0, 1), newFactory('Also gone', 1, 2)]

    markPlanReplaced(cleared, [])

    expect(emit).toHaveBeenCalledWith('factoryEdited', cleared[0])
    expect(emit).toHaveBeenCalledWith('factoryEdited', cleared[1])
  })
})

describe('markFactoryRemoved', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('declares the removed id and claims the record as the user\'s own edit', () => {
    const emit = vi.spyOn(eventBus, 'emit')
    const doomed = newFactory('Doomed', 0, 7)

    markFactoryRemoved(doomed)

    expect(emit).toHaveBeenCalledWith('factoryEdited', doomed)
    expect(emit).toHaveBeenCalledWith('planReplaced', { removedIds: [7] })
  })
})
