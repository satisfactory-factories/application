import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fingerprintPlan,
  pruneSnapshotLinks,
  readSnapshotLink,
  readSnapshotLinks,
  rememberSnapshotLink,
  SNAPSHOT_LINKS_KEY,
} from '@/sync/snapshot-links'
import { resetStorageWarning } from '@/utils/safe-storage'

describe('snapshot-links', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    resetStorageWarning()
  })

  describe('fingerprinting the plan', () => {
    it('gives the same answer for the same plan', () => {
      const plan = { id: 'tab-1', name: 'Iron', factories: [{ id: 1, name: 'Smelters' }] }

      expect(fingerprintPlan(plan)).toBe(fingerprintPlan({ ...plan }))
    })

    it('changes when anything in the plan does', () => {
      const before = fingerprintPlan({ name: 'Iron', factories: [{ id: 1, amount: 60 }] })

      expect(fingerprintPlan({ name: 'Iron', factories: [{ id: 1, amount: 61 }] })).not.toBe(before)
      expect(fingerprintPlan({ name: 'Steel', factories: [{ id: 1, amount: 60 }] })).not.toBe(before)
      expect(fingerprintPlan({ name: 'Iron', factories: [] })).not.toBe(before)
    })

    it('handles a payload that will not serialise at all', () => {
      expect(() => fingerprintPlan(() => 'not a plan')).not.toThrow()
    })
  })

  it('has no link for a tab that has never been shared', () => {
    expect(readSnapshotLink('tab-1')).toBeUndefined()
    expect(readSnapshotLinks()).toEqual({})
  })

  it('remembers the link and the plan it froze', () => {
    rememberSnapshotLink('tab-1', { shareId: 'three-word-id', fingerprint: 'abc' })

    expect(readSnapshotLink('tab-1')).toEqual({ shareId: 'three-word-id', fingerprint: 'abc' })
  })

  it('keeps one record per tab, the newest', () => {
    rememberSnapshotLink('tab-1', { shareId: 'first', fingerprint: 'abc' })
    rememberSnapshotLink('tab-2', { shareId: 'other', fingerprint: 'def' })
    rememberSnapshotLink('tab-1', { shareId: 'second', fingerprint: 'ghi' })

    expect(readSnapshotLinks()).toEqual({
      'tab-1': { shareId: 'second', fingerprint: 'ghi' },
      'tab-2': { shareId: 'other', fingerprint: 'def' },
    })
  })

  describe('sweeping', () => {
    it('drops the tabs this browser no longer holds', () => {
      rememberSnapshotLink('tab-1', { shareId: 'kept', fingerprint: 'abc' })
      rememberSnapshotLink('tab-2', { shareId: 'gone', fingerprint: 'def' })

      pruneSnapshotLinks(['tab-1'])

      expect(readSnapshotLinks()).toEqual({ 'tab-1': { shareId: 'kept', fingerprint: 'abc' } })
    })

    it('writes nothing when there is nothing stale', () => {
      rememberSnapshotLink('tab-1', { shareId: 'kept', fingerprint: 'abc' })
      const write = vi.spyOn(Storage.prototype, 'setItem')

      pruneSnapshotLinks(['tab-1', 'tab-2'])

      expect(write).not.toHaveBeenCalled()
    })
  })

  describe('reading what is already in the browser', () => {
    it('survives a value that is not JSON at all', () => {
      localStorage.setItem(SNAPSHOT_LINKS_KEY, '{ not json')

      expect(readSnapshotLinks()).toEqual({})
    })

    // A half-written record would otherwise put a link of "undefined" on screen.
    it('keeps only the records carrying both halves', () => {
      localStorage.setItem(SNAPSHOT_LINKS_KEY, JSON.stringify({
        good: { shareId: 'three-word-id', fingerprint: 'abc' },
        noFingerprint: { shareId: 'three-word-id' },
        noId: { fingerprint: 'abc' },
        empty: { shareId: '', fingerprint: 'abc' },
        wrongShape: 'a link',
      }))

      expect(readSnapshotLinks()).toEqual({
        good: { shareId: 'three-word-id', fingerprint: 'abc' },
      })
    })

    it('does not throw when the browser refuses to save', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded')
      })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => rememberSnapshotLink('tab-1', { shareId: 'x', fingerprint: 'y' })).not.toThrow()
    })
  })
})
