import { describe, expect, it } from 'vitest'
import { interleaveTabOrder, sameOrder, syncedTabOrder } from '@/sync/tab-order'

/** Ids starting with `s` are synced rooms; everything else is a local tab. */
const isSynced = (tabId: string) => tabId.startsWith('s')

describe('tab-order', () => {
  describe('syncedTabOrder', () => {
    it('keeps the synced tabs in the sequence they are displayed in', () => {
      expect(syncedTabOrder(['s2', 'local', 's1'], isSynced)).toEqual(['s2', 's1'])
    })

    it('sends nothing for a bar with no synced tabs', () => {
      expect(syncedTabOrder(['local', 'other'], isSynced)).toEqual([])
    })
  })

  describe('interleaveTabOrder', () => {
    it('deals the synced tabs into their own slots and leaves local tabs alone', () => {
      const order = interleaveTabOrder(['s1', 'local', 's2', 's3'], ['s3', 's2', 's1'], isSynced)

      expect(order).toEqual(['s3', 'local', 's2', 's1'])
    })

    it('is idempotent: re-applying an order the bar already shows changes nothing', () => {
      const server = ['s3', 's2', 's1']
      const once = interleaveTabOrder(['s1', 'local', 's2', 's3'], server, isSynced)

      expect(interleaveTabOrder(once, server, isSynced)).toEqual(once)
    })

    it('never moves a local tab, wherever the synced ones go', () => {
      const order = interleaveTabOrder(['a', 's1', 'b', 's2', 'c'], ['s2', 's1'], isSynced)

      expect(order).toEqual(['a', 's2', 'b', 's1', 'c'])
    })

    it('ignores a server id this browser has no tab for', () => {
      const order = interleaveTabOrder(['local', 's1'], ['s9', 's1'], isSynced)

      expect(order).toEqual(['local', 's1'])
    })

    it('keeps a synced tab the server order did not mention, at the back', () => {
      const order = interleaveTabOrder(['s1', 's2', 's3'], ['s3'], isSynced)

      expect(order).toEqual(['s3', 's1', 's2'])
    })

    it('returns the bar untouched when the server sends no order at all', () => {
      expect(interleaveTabOrder(['s1', 'local'], [], isSynced)).toEqual(['s1', 'local'])
    })
  })

  describe('sameOrder', () => {
    it('compares element by element, length included', () => {
      expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true)
      expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false)
      expect(sameOrder(['a'], ['a', 'b'])).toBe(false)
    })
  })
})
