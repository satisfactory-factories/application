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
  it('drops tasks past the count cap, in place', () => {
    const tasks = Array.from({ length: 80 }, () => ({ title: 'ok', completed: false }))
    const factory = makeFactory({ tasks })
    const original = factory.tasks

    expect(truncateFactory(factory)).toBe(factory)
    expect(factory.tasks).toBe(original)
    expect(factory.tasks).toHaveLength(CAPS.tasks)
  })

  it('leaves text alone, which the text rules judge instead', () => {
    const factory = truncateFactory(makeFactory({ name: 'a'.repeat(500), notes: 'n'.repeat(5000) }))
    expect(factory.name).toHaveLength(500)
    expect(factory.notes).toHaveLength(5000)
  })

  it('survives junk', () => {
    const junk = { name: 42, notes: null, tasks: 'nope', group: 7 } as unknown as Factory
    expect(() => truncateFactory(junk)).not.toThrow()
    expect(junk).toEqual({ name: 42, notes: null, tasks: 'nope', group: 7 })
    expect(truncateFactory(null as unknown as Factory)).toBeNull()
  })
})

describe('truncateFactoryTab and truncateRoomDiff', () => {
  const tasks = () => Array.from({ length: 80 }, () => ({ title: 'ok', completed: false }))

  it('cap the tasks on every factory a tab holds', () => {
    const tab = truncateFactoryTab(makeFactoryTab({ factories: [makeFactory({ tasks: tasks() })] }))
    expect(tab.factories[0].tasks).toHaveLength(CAPS.tasks)
  })

  it('cap the tasks on every factory a diff carries', () => {
    const diff = truncateRoomDiff({ factories: [makeFactory({ tasks: tasks() })] })
    expect(diff.factories?.[0].tasks).toHaveLength(CAPS.tasks)
    expect(truncateRoomDiff({})).toEqual({})
  })
})
