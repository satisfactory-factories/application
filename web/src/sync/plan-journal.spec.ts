import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROTOCOL_VERSION } from 'common'
import {
  dropJournalRoom,
  forgetInstanceId,
  INSTANCE_ID_KEY,
  instanceId,
  JOURNAL_SLOT_TTL_MS,
  PLAN_JOURNAL_KEY,
  prunePlanJournal,
  readPlanJournal,
  recoverJournalRoom,
  touchJournalSlot,
  writeJournalRoom,
} from '@/sync/plan-journal'
import type { JournalRoom } from '@/sync/plan-journal'
import { refuseLocalStorageWrites } from '../../testing/storage'
import { resetStorageWarning } from '@/utils/safe-storage'

const ROOM = 'room-1'

const entry = (overrides: Partial<JournalRoom> = {}): JournalRoom => ({
  revision: 4,
  appVersion: PROTOCOL_VERSION,
  userTouchedIds: [],
  userTouchedFields: [],
  declaredRemovals: [],
  baselinePrints: {},
  records: {},
  ...overrides,
})

/** A second browser tab is a second instance id over the same localStorage. */
const asAnotherBrowserTab = (write: () => void) => {
  const mine = sessionStorage.getItem(INSTANCE_ID_KEY)
  sessionStorage.removeItem(INSTANCE_ID_KEY)
  forgetInstanceId()

  write()

  if (mine) sessionStorage.setItem(INSTANCE_ID_KEY, mine)
  else sessionStorage.removeItem(INSTANCE_ID_KEY)
  forgetInstanceId()
}

describe('plan-journal', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    forgetInstanceId()
    resetStorageWarning()
  })

  describe('instance identity', () => {
    it('is stable across a reload of the same browser tab', () => {
      const first = instanceId()
      forgetInstanceId()

      expect(instanceId()).toBe(first)
    })

    it('is a different id in a browser tab that has no session of its own', () => {
      const first = instanceId()
      sessionStorage.removeItem(INSTANCE_ID_KEY)
      forgetInstanceId()

      expect(instanceId()).not.toBe(first)
    })

    /** Private mode and blocked site data both throw here rather than returning null. */
    it('still hands out an id when the browser refuses session storage', () => {
      vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })
      vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })

      expect(instanceId()).toMatch(/^[0-9a-f-]{36}$/)
      vi.restoreAllMocks()
    })
  })

  describe('recovering what a room still owes', () => {
    it('reads back what this instance wrote', () => {
      writeJournalRoom(ROOM, entry({ userTouchedIds: [1], records: { 1: '{"id":1}' } }))

      expect(recoverJournalRoom(ROOM)).toMatchObject({
        revision: 4,
        userTouchedIds: [1],
        records: { 1: '{"id":1}' },
      })
    })

    it('has nothing to say about a room nobody has written', () => {
      expect(recoverJournalRoom('never-seen')).toBeNull()
    })

    /**
     * The whole point of the partition. A sibling writing a newer generation is exactly the
     * case being rescued, so taking the newest slot alone would drop the older tab's edit —
     * which is the bug this file exists for.
     */
    it('unions every instance rather than letting the newest one win', () => {
      writeJournalRoom(ROOM, entry({ userTouchedIds: [1], records: { 1: '{"id":1,"n":"mine"}' } }))
      asAnotherBrowserTab(() => {
        writeJournalRoom(ROOM, entry({ revision: 9, userTouchedIds: [2], records: { 2: '{"id":2}' } }))
      })

      const recovered = recoverJournalRoom(ROOM)
      expect(recovered?.userTouchedIds.sort()).toEqual([1, 2])
      expect(recovered?.records).toEqual({ 1: '{"id":1,"n":"mine"}', 2: '{"id":2}' })
    })

    it('takes the furthest-along revision, because an older slot has seen less', () => {
      writeJournalRoom(ROOM, entry({ revision: 4 }))
      asAnotherBrowserTab(() => writeJournalRoom(ROOM, entry({ revision: 9 })))

      expect(recoverJournalRoom(ROOM)?.revision).toBe(9)
    })

    it('lets this instance settle a record two slots both hold', () => {
      asAnotherBrowserTab(() => {
        writeJournalRoom(ROOM, entry({ userTouchedIds: [1], records: { 1: '{"id":1,"n":"theirs"}' } }))
      })
      writeJournalRoom(ROOM, entry({ userTouchedIds: [1], records: { 1: '{"id":1,"n":"mine"}' } }))

      expect(recoverJournalRoom(ROOM)?.records[1]).toBe('{"id":1,"n":"mine"}')
    })

    it('carries an unanswered question back with the records', () => {
      writeJournalRoom(ROOM, entry({
        userTouchedIds: [1],
        conflict: { revision: 6, factoryIds: [1] },
      }))

      expect(recoverJournalRoom(ROOM)?.conflict).toEqual({ revision: 6, factoryIds: [1] })
    })

    it('drops only this instance\'s entry for a room, never a sibling\'s', () => {
      asAnotherBrowserTab(() => writeJournalRoom(ROOM, entry({ userTouchedIds: [2] })))
      writeJournalRoom(ROOM, entry({ userTouchedIds: [1] }))

      dropJournalRoom(ROOM)

      expect(recoverJournalRoom(ROOM)?.userTouchedIds).toEqual([2])
    })
  })

  describe('what it refuses to believe', () => {
    it('reads an unparseable key as an empty journal', () => {
      localStorage.setItem(PLAN_JOURNAL_KEY, '{not json')

      expect(readPlanJournal()).toEqual({})
    })

    it('skips a room entry with no revision on it', () => {
      localStorage.setItem(PLAN_JOURNAL_KEY, JSON.stringify({
        someone: { at: 1, rooms: { [ROOM]: { userTouchedIds: [1] } } },
      }))

      expect(recoverJournalRoom(ROOM)).toBeNull()
    })

    it('filters the entries inside a room entry rather than throwing them all away', () => {
      localStorage.setItem(PLAN_JOURNAL_KEY, JSON.stringify({
        someone: {
          at: 1,
          rooms: {
            [ROOM]: {
              revision: 4,
              userTouchedIds: [1, 'two', 3],
              records: { 1: '{"id":1}', 2: 17 },
              conflict: { revision: 6, factoryIds: [] },
            },
          },
        },
      }))

      const recovered = recoverJournalRoom(ROOM)
      expect(recovered?.userTouchedIds).toEqual([1, 3])
      expect(recovered?.records).toEqual({ 1: '{"id":1}' })
      expect(recovered?.conflict, 'a question about no factories is not a question').toBeUndefined()
    })
  })

  describe('a browser that refuses to save', () => {
    /**
     * A plan with hundreds of edited records can be what tipped the quota, and the intent
     * is a fraction of that. Keeping the smaller half is worth more than keeping nothing.
     */
    it('falls back to writing the intent without the records', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      // Refuses only the first attempt, which is the one carrying the records.
      let attempts = 0
      const restore = refuseLocalStorageWrites(key => key === PLAN_JOURNAL_KEY && attempts++ === 0)

      const written = writeJournalRoom(ROOM, entry({ userTouchedIds: [1], records: { 1: 'x'.repeat(50) } }))
      restore()

      expect(written).toBe(true)
      expect(recoverJournalRoom(ROOM)?.userTouchedIds).toEqual([1])
      expect(recoverJournalRoom(ROOM)?.records).toEqual({})
      vi.restoreAllMocks()
    })

    it('says so rather than claiming a write it never made', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const restore = refuseLocalStorageWrites(key => key === PLAN_JOURNAL_KEY)

      expect(writeJournalRoom(ROOM, entry({ userTouchedIds: [1] }))).toBe(false)
      restore()
      vi.restoreAllMocks()
    })
  })

  describe('sweeping', () => {
    it('drops room entries for tabs this browser no longer holds', () => {
      writeJournalRoom(ROOM, entry())
      writeJournalRoom('closed-tab', entry())

      prunePlanJournal([ROOM])

      expect(recoverJournalRoom('closed-tab')).toBeNull()
      expect(recoverJournalRoom(ROOM)).not.toBeNull()
    })

    it('keeps a long-abandoned slot that still owes an edit until it is a month old', () => {
      asAnotherBrowserTab(() => writeJournalRoom(ROOM, entry({ userTouchedIds: [1] })))
      instanceId()

      prunePlanJournal([ROOM], Date.now() + JOURNAL_SLOT_TTL_MS - 1_000)
      expect(recoverJournalRoom(ROOM)?.userTouchedIds).toEqual([1])

      prunePlanJournal([ROOM], Date.now() + JOURNAL_SLOT_TTL_MS + 1_000)
      expect(recoverJournalRoom(ROOM)).toBeNull()
    })

    it('never sweeps this instance, however long it has sat still', () => {
      writeJournalRoom(ROOM, entry({ userTouchedIds: [1] }))

      prunePlanJournal([ROOM], Date.now() + JOURNAL_SLOT_TTL_MS * 12)

      expect(recoverJournalRoom(ROOM)?.userTouchedIds).toEqual([1])
    })

    it('keeps a slot alive without rewriting what it holds', () => {
      writeJournalRoom(ROOM, entry({ userTouchedIds: [1] }))
      const before = readPlanJournal()[instanceId()].at

      vi.useFakeTimers({ now: Date.now() + 60_000 })
      touchJournalSlot()
      vi.useRealTimers()

      expect(readPlanJournal()[instanceId()].at).toBeGreaterThan(before)
      expect(recoverJournalRoom(ROOM)?.userTouchedIds).toEqual([1])
    })
  })
})
