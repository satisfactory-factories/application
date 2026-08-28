import type { RoomListEntry } from 'common'
import type { TabSyncState } from '@/sync/tab-sync-state'

/**
 * What the share dialog may offer for one tab. Snapshot links are always
 * available; the live invite half depends on the tab being a room and on this
 * user owning it.
 */
export interface ShareCapabilities {
  /** A frozen copy link. Any tab, no account. */
  canSnapshot: boolean
  /** The tab is a room, so a live invite is conceivable. */
  isRoom: boolean
  /** Share, unshare, re-slug and password are owner-only. */
  canManageInvite: boolean
  /** The room is currently shared, so a live link exists. */
  isShared: boolean
  inviteLink: string | null
  hasPassword: boolean
  /** Why the invite half is unavailable, or null when it is available. */
  blockedReason: string | null
}

export const roomLink = (slug: string, origin: string): string => `${origin}/room/${slug}`

export const shareCapabilities = (
  state: TabSyncState,
  entry: RoomListEntry | undefined,
  origin: string,
): ShareCapabilities => {
  const base = { canSnapshot: true, hasPassword: entry?.hasPassword ?? false }

  if (state.kind === 'local') {
    return {
      ...base,
      isRoom: false,
      canManageInvite: false,
      isShared: false,
      inviteLink: null,
      blockedReason: 'This plan lives in this browser only. Sync it from the + button to invite people to edit it with you.',
    }
  }

  // A joined tab is an anonymous pointer: the visitor already came in by a link
  // and has no membership row to read a slug from.
  if (state.kind === 'joined') {
    return {
      ...base,
      isRoom: true,
      canManageInvite: false,
      isShared: true,
      inviteLink: null,
      blockedReason: 'You are editing this plan through an invite link. Only its owner can change how it is shared.',
    }
  }

  const isOwner = state.role === 'owner'
  const shared = entry?.shared ?? state.shared
  const slug = entry?.slug ?? null

  return {
    ...base,
    isRoom: true,
    canManageInvite: isOwner,
    isShared: shared,
    inviteLink: shared && slug ? roomLink(slug, origin) : null,
    blockedReason: isOwner ? null : 'Only the owner can change how this plan is shared.',
  }
}
