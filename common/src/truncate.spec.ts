import { describe, expect, it } from 'vitest'

import { CAPS } from './caps'
import { makeFactory, makeFactoryTab } from './testing/fixtures'
import { truncateFactory, truncateFactoryTab, truncateRoomDiff, truncateString } from './truncate'
import type { Factory } from './types/factory'

describe('truncateString', () => {
  it('cuts to the cap', () => {
    expect(truncateString('x'.repeat(250), CAPS.name)).toHaveLength(CAPS.name)
  })

  it('leaves shorter strings alone', () => {
    expect(truncateString('short', CAPS.name)).toBe('short')
  })
})

describe('truncateFactory', () => {
  it('mutates in place and returns the same object', () => {
    const factory = makeFactory({ name: 'a'.repeat(500) })
    expect(truncateFactory(factory)).toBe(factory)
    expect(factory.name).toHaveLength(CAPS.name)
  })

  it('truncates notes to 1000', () => {
    const factory = truncateFactory(makeFactory({ notes: 'n'.repeat(5000) }))
    expect(factory.notes).toHaveLength(CAPS.notes)
  })

  it('drops tasks past the count cap and truncates the titles it keeps', () => {
    const tasks = Array.from({ length: 80 }, () => ({ title: 't'.repeat(400), completed: false }))
    const factory = truncateFactory(makeFactory({ tasks }))

    expect(factory.tasks).toHaveLength(CAPS.tasks)
    expect(factory.tasks.every(task => task.title.length === CAPS.taskTitle)).toBe(true)
  })

  it('truncates the tasks array in place rather than replacing it', () => {
    const tasks = Array.from({ length: 80 }, () => ({ title: 'ok', completed: false }))
    const factory = makeFactory({ tasks })
    const original = factory.tasks

    truncateFactory(factory)
    expect(factory.tasks).toBe(original)
  })

  it('truncates the carried group name', () => {
    const factory = truncateFactory(makeFactory({
      group: { id: 'g-1', name: 'g'.repeat(400), color: '#fff', order: 0 },
    }))
    expect(factory.group?.name).toHaveLength(CAPS.name)
  })

  it('leaves the group colour alone — that one is rejected, not truncated', () => {
    const color = 'c'.repeat(64)
    const factory = truncateFactory(makeFactory({
      group: { id: 'g-1', name: 'Group', color, order: 0 },
    }))
    expect(factory.group?.color).toBe(color)
  })

  it('survives junk in the fields it clamps', () => {
    const junk = { name: 42, notes: null, tasks: 'nope', group: 7 } as unknown as Factory
    expect(() => truncateFactory(junk)).not.toThrow()
    expect(junk).toEqual({ name: 42, notes: null, tasks: 'nope', group: 7 })
  })

  it('survives a non-object', () => {
    expect(truncateFactory(null as unknown as Factory)).toBeNull()
  })
})

describe('truncateFactoryTab', () => {
  it('truncates the tab name, the group registry and every factory', () => {
    const tab = truncateFactoryTab(makeFactoryTab({
      name: 'T'.repeat(400),
      groups: [{ id: 'g-1', name: 'g'.repeat(400), color: '#fff', order: 0 }],
      factories: [makeFactory({ name: 'f'.repeat(400), notes: 'n'.repeat(4000) })],
    }))

    expect(tab.name).toHaveLength(CAPS.name)
    expect(tab.groups?.[0].name).toHaveLength(CAPS.name)
    expect(tab.factories[0].name).toHaveLength(CAPS.name)
    expect(tab.factories[0].notes).toHaveLength(CAPS.notes)
  })
})

describe('truncateRoomDiff', () => {
  it('applies the same rules to an op payload', () => {
    const diff = truncateRoomDiff({
      name: 'T'.repeat(400),
      groups: [{ id: 'g-1', name: 'g'.repeat(400), color: '#fff', order: 0 }],
      factories: [makeFactory({ notes: 'n'.repeat(4000) })],
    })

    expect(diff.name).toHaveLength(CAPS.name)
    expect(diff.groups?.[0].name).toHaveLength(CAPS.name)
    expect(diff.factories?.[0].notes).toHaveLength(CAPS.notes)
  })

  it('leaves an empty diff untouched', () => {
    expect(truncateRoomDiff({})).toEqual({})
  })
})
