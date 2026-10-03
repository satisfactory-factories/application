import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Factory, FactoryTab, RoomDiff, RoomSnapshot } from 'common'
import {
  ackedFromContent,
  applyDiffToAcked,
  applyDiffToContent,
  buildDiff,
  contentFromAcked,
  contentFromSnapshot,
  contentOfTab,
  emptyAcked,
  mergeFactories,
  stableStringify,
  UNKNOWN_CONTENT,
} from '@/sync/room-state'
import type { RoomContent } from '@/sync/room-state'
import { newFactory } from '@/utils/factory-management/factory'

const factory = (id: number, name: string): Factory => newFactory(name, id - 1, id)

const content = (factories: Factory[], overrides: Partial<RoomContent> = {}): RoomContent => ({
  name: 'Plan',
  powerTarget: 0,
  groups: [],
  factories,
  ...overrides,
})

describe('stableStringify', () => {
  it('is insensitive to key order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })

  it('keeps array order, which is real data', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })

  it('drops undefined the way the wire does', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}')
  })

  it('handles the primitives a plan holds', () => {
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify(3)).toBe('3')
    expect(stableStringify('x')).toBe('"x"')
    expect(stableStringify(false)).toBe('false')
  })
})

describe('mergeFactories', () => {
  it('replaces by id and keeps position', () => {
    const current = [factory(1, 'One'), factory(2, 'Two')]
    const diff: RoomDiff = { factories: [{ ...factory(2, 'Renamed') }] }

    const merged = mergeFactories(current, diff)

    expect(merged.map(entry => entry.name)).toEqual(['One', 'Renamed'])
  })

  it('appends records the current list does not hold', () => {
    const merged = mergeFactories([factory(1, 'One')], { factories: [factory(3, 'Three')] })
    expect(merged.map(entry => entry.id)).toEqual([1, 3])
  })

  it('removes ids the diff lists', () => {
    const merged = mergeFactories([factory(1, 'One'), factory(2, 'Two')], { removedFactoryIds: [1] })
    expect(merged.map(entry => entry.id)).toEqual([2])
  })

  it('lands one record when a diff repeats an id', () => {
    // Duplicate ids break the export/import chain outright.
    const merged = mergeFactories([], { factories: [factory(4, 'A'), factory(4, 'B')] })
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('B')
  })
})

describe('buildDiff', () => {
  it('returns null when local state is the baseline', () => {
    const local = content([factory(1, 'One')])
    expect(buildDiff(ackedFromContent(local, 3), local)).toBeNull()
  })

  it('sends only the records that changed', () => {
    const before = content([factory(1, 'One'), factory(2, 'Two')])
    const acked = ackedFromContent(before, 3)
    const after = content([factory(1, 'One'), factory(2, 'Renamed')])

    const result = buildDiff(acked, after)

    expect(result?.diff.factories?.map(entry => entry.id)).toEqual([2])
    expect(result?.diff.removedFactoryIds).toBeUndefined()
  })

  it('reports removals against the baseline', () => {
    const acked = ackedFromContent(content([factory(1, 'One'), factory(2, 'Two')]), 3)

    const result = buildDiff(acked, content([factory(1, 'One')]))

    expect(result?.diff.removedFactoryIds).toEqual([2])
    expect(result?.diff.factories).toBeUndefined()
  })

  it('carries the tab-level fields that moved', () => {
    const acked = ackedFromContent(content([], { name: 'Plan', powerTarget: 100 }), 1)

    const result = buildDiff(acked, content([], { name: 'Renamed', powerTarget: 100 }))

    expect(result?.diff.name).toBe('Renamed')
    expect(result?.diff.powerTarget).toBeUndefined()
  })

  it('hands back a plain deep copy, never the live record', () => {
    const live = factory(1, 'One')
    const result = buildDiff(emptyAcked(), content([live]))

    expect(result?.diff.factories?.[0]).not.toBe(live)
    result!.diff.factories![0].name = 'Mutated'
    expect(live.name).toBe('One')
  })

  it('retains the baseline the op becomes once acked', () => {
    const acked = ackedFromContent(content([factory(1, 'One')]), 4)
    const result = buildDiff(acked, content([factory(1, 'Renamed'), factory(2, 'Two')]))

    expect([...result!.sent.factories.keys()]).toEqual([1, 2])
    expect(result!.sent.factories.get(1)).toBe(stableStringify(factory(1, 'Renamed')))
  })
})

describe('applyDiffToAcked', () => {
  it('mirrors the merge, so the baseline tracks the server byte for byte', () => {
    const start = content([factory(1, 'One'), factory(2, 'Two')])
    const diff: RoomDiff = { factories: [factory(3, 'Three')], removedFactoryIds: [1], name: 'Renamed' }

    const acked = applyDiffToAcked(ackedFromContent(start, 5), diff, 6)
    const merged = applyDiffToContent(start, diff)

    expect(acked.revision).toBe(6)
    expect(acked.name).toBe('Renamed')
    expect([...acked.factories.keys()]).toEqual(merged.factories.map(entry => entry.id))
  })
})

describe('contentFromAcked', () => {
  it('round-trips a baseline back into records', () => {
    const start = content([factory(1, 'One')], { name: 'Plan', powerTarget: 42 })
    const back = contentFromAcked(ackedFromContent(start, 2))

    expect(back?.name).toBe('Plan')
    expect(back?.powerTarget).toBe(42)
    expect(back?.factories.map(entry => entry.id)).toEqual([1])
  })

  it('refuses when any part of the baseline was never seen', () => {
    const acked = ackedFromContent(content([factory(1, 'One')]), 2)
    acked.factories.set(1, UNKNOWN_CONTENT)
    expect(contentFromAcked(acked)).toBeNull()

    const fields = ackedFromContent(content([]), 2)
    fields.powerTarget = Number.NaN
    expect(contentFromAcked(fields)).toBeNull()
  })
})

describe('contentOfTab', () => {
  it('unwraps reactive state, so no proxy can reach a clone or the wire', () => {
    const tab = reactive<FactoryTab>({
      id: 'room-1',
      name: 'Plan',
      factories: [factory(1, 'One')],
    })

    const local = contentOfTab(tab)

    expect(local.powerTarget).toBe(0)
    expect(() => structuredClone(local.factories)).not.toThrow()
  })
})

describe('contentFromSnapshot', () => {
  it('defaults the fields an older room may not carry', () => {
    const snapshot = {
      roomId: 'room-1',
      name: 'Plan',
      slug: null,
      shared: false,
      hasPassword: false,
      factories: [],
      revision: 1,
    } as unknown as RoomSnapshot

    expect(contentFromSnapshot(snapshot)).toMatchObject({ powerTarget: 0, groups: [] })
  })
})
