import { describe, expect, it } from 'vitest'
import { diffChangesContent } from '@/sync/plan-activity'
import { newFactory } from '@/utils/factory-management/factory'

const plan = () => [newFactory('Smelters', 0, 1), newFactory('Constructors', 1, 2)]

describe('diffChangesContent', () => {
  it('is false for a room rename', () => {
    expect(diffChangesContent({ name: 'Renamed' }, plan())).toBe(false)
  })

  it('is false for a reorder, which only moves the indexes', () => {
    const current = plan()
    const moved = current.map(factory => ({ ...factory, displayOrder: 1 - factory.displayOrder }))

    expect(diffChangesContent({ factories: moved }, current)).toBe(false)
  })

  it('is false for a factory renamed by a peer', () => {
    const current = plan()
    const renamed = [{ ...current[0], name: 'Steel Beams' }]

    expect(diffChangesContent({ factories: renamed }, current)).toBe(false)
  })

  it('is true for a factory whose notes changed', () => {
    const current = plan()
    const edited = [{ ...current[0], notes: 'Needs a second smelter' }]

    expect(diffChangesContent({ factories: edited }, current)).toBe(true)
  })

  it('is true for a factory this client has never seen', () => {
    expect(diffChangesContent({ factories: [newFactory('New', 2, 3)] }, plan())).toBe(true)
  })

  it('is true for a removal and for a power target', () => {
    expect(diffChangesContent({ removedFactoryIds: [1] }, plan())).toBe(true)
    expect(diffChangesContent({ powerTarget: 500 }, plan())).toBe(true)
  })

  it('is false for a diff carrying nothing but the group list', () => {
    expect(diffChangesContent({ groups: [] }, plan())).toBe(false)
  })
})
