import { beforeEach, describe, expect, it } from 'vitest'
import {
  isCollaborative,
  LOCAL_TAB_STATE,
  readTabSyncStates,
  TAB_SYNC_STATE_KEY,
  writeTabSyncStates,
} from '@/sync/tab-sync-state'

describe('tab-sync-state', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips a map', () => {
    writeTabSyncStates({
      a: { kind: 'synced', shared: true, role: 'member', revision: 12 },
    })

    expect(readTabSyncStates()).toEqual({
      a: { kind: 'synced', shared: true, role: 'member', revision: 12 },
    })
  })

  it('returns an empty map when there is nothing stored', () => {
    expect(readTabSyncStates()).toEqual({})
  })

  it('survives corrupt JSON rather than throwing', () => {
    localStorage.setItem(TAB_SYNC_STATE_KEY, '{not json')

    expect(readTabSyncStates()).toEqual({})
  })

  it('drops entries whose kind is not one we know', () => {
    localStorage.setItem(TAB_SYNC_STATE_KEY, JSON.stringify({
      good: { kind: 'joined', shared: true, role: 'member', revision: null },
      bad: { kind: 'wat', shared: true },
    }))

    expect(Object.keys(readTabSyncStates())).toEqual(['good'])
  })

  it('repairs a partial entry instead of trusting it', () => {
    localStorage.setItem(TAB_SYNC_STATE_KEY, JSON.stringify({ a: { kind: 'synced' } }))

    expect(readTabSyncStates().a).toEqual({
      kind: 'synced',
      shared: false,
      role: 'owner',
      revision: null,
    })
  })

  describe('isCollaborative', () => {
    it('is false for a local tab', () => {
      expect(isCollaborative(LOCAL_TAB_STATE)).toBe(false)
    })

    it('is false for a private synced tab', () => {
      expect(isCollaborative({ kind: 'synced', shared: false, role: 'owner', revision: 1 })).toBe(false)
    })

    it('is true for a shared synced tab', () => {
      expect(isCollaborative({ kind: 'synced', shared: true, role: 'owner', revision: 1 })).toBe(true)
    })

    it('is true for a joined tab', () => {
      expect(isCollaborative({ kind: 'joined', shared: true, role: 'member', revision: null })).toBe(true)
    })
  })
})
