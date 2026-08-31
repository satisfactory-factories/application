import { describe, expect, it } from 'vitest'
import type { RoomListEntry } from 'common'
import { roomLink, shareCapabilities } from '@/sync/share-capabilities'
import type { TabSyncState } from '@/sync/tab-sync-state'

const ORIGIN = 'https://satisfactory-factories.app'

const state = (overrides: Partial<TabSyncState> = {}): TabSyncState => ({
  kind: 'synced',
  shared: false,
  role: 'owner',
  revision: 3,
  ...overrides,
})

const entry = (overrides: Partial<RoomListEntry> = {}): RoomListEntry => ({
  roomId: 'room-1',
  name: 'Plan',
  slug: null,
  shared: false,
  hasPassword: false,
  revision: 3,
  role: 'owner',
  order: 0,
  lastActivityAt: '2026-08-31T11:00:00.000Z',
  factoryCount: 0,
  ...overrides,
})

describe('shareCapabilities', () => {
  describe('a local tab', () => {
    const local = () => shareCapabilities(state({ kind: 'local' }), undefined, ORIGIN)

    it('can still make a snapshot link', () => {
      expect(local().canSnapshot).toBe(true)
    })

    it('offers no live invite at all', () => {
      expect(local().isRoom).toBe(false)
      expect(local().canManageInvite).toBe(false)
      expect(local().inviteLink).toBeNull()
      expect(local().blockedReason).toContain('this browser only')
    })
  })

  describe('the owner of a synced tab', () => {
    it('may invite, but has no link until the room is shared', () => {
      const result = shareCapabilities(state(), entry(), ORIGIN)

      expect(result.canManageInvite).toBe(true)
      expect(result.isShared).toBe(false)
      expect(result.inviteLink).toBeNull()
      expect(result.blockedReason).toBeNull()
    })

    it('gets the copyable room link once it is shared', () => {
      const result = shareCapabilities(
        state({ shared: true }),
        entry({ shared: true, slug: 'iron-plate-hub' }),
        ORIGIN,
      )

      expect(result.inviteLink).toBe('https://satisfactory-factories.app/room/iron-plate-hub')
      expect(result.canManageInvite).toBe(true)
    })

    it('reports the password state from the room list', () => {
      const result = shareCapabilities(
        state({ shared: true }),
        entry({ shared: true, slug: 'a-b-c', hasPassword: true }),
        ORIGIN,
      )

      expect(result.hasPassword).toBe(true)
    })
  })

  describe('a member of someone else\'s room', () => {
    const member = () => shareCapabilities(
      state({ shared: true, role: 'member' }),
      entry({ shared: true, slug: 'a-b-c', role: 'member' }),
      ORIGIN,
    )

    it('can copy the link but change nothing', () => {
      expect(member().canManageInvite).toBe(false)
      expect(member().inviteLink).toBe('https://satisfactory-factories.app/room/a-b-c')
      expect(member().blockedReason).toContain('Only the owner')
    })

    it('can still take a snapshot of what they can see', () => {
      expect(member().canSnapshot).toBe(true)
    })
  })

  describe('an anonymous visitor', () => {
    // A joined tab has no membership row, so there is no slug to read back.
    const visitor = () => shareCapabilities(state({ kind: 'joined', role: 'member' }), undefined, ORIGIN)

    it('manages nothing and is told why', () => {
      expect(visitor().isRoom).toBe(true)
      expect(visitor().canManageInvite).toBe(false)
      expect(visitor().inviteLink).toBeNull()
      expect(visitor().blockedReason).toContain('invite link')
    })

    it('can still take a snapshot copy of the plan', () => {
      expect(visitor().canSnapshot).toBe(true)
    })
  })

  describe('offline mode', () => {
    const offline = () => shareCapabilities(
      state(),
      entry({ shared: true, slug: 'a-b-c' }),
      ORIGIN,
      true,
    )

    it('offers nothing that would reach the server', () => {
      expect(offline().canSnapshot).toBe(false)
      expect(offline().canManageInvite).toBe(false)
      expect(offline().blockedReason).toContain('offline mode')
    })

    it('still hands over the link the room already has', () => {
      expect(offline().inviteLink).toBe('https://satisfactory-factories.app/room/a-b-c')
    })
  })

  it('builds the room link against whatever origin it is given', () => {
    expect(roomLink('a-b-c', 'http://localhost:3000')).toBe('http://localhost:3000/room/a-b-c')
  })
})
