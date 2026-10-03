import { Room } from './schemas/room.schema'
import { RoomMembership } from './schemas/room-membership.schema'

/** Absent on rooms and rows written before the epoch existed; 0 keeps those valid. */
const epochOf = (value: number | undefined | null): number => value ?? 0

export const roomEpoch = (room: Pick<Room, 'membershipEpoch'>): number => epochOf(room.membershipEpoch)

/**
 * Unshare bumps the room's epoch in the same write that clears `shared`, so every
 * non-owner row granted under an older one is void from that instant — before the
 * deletions, the revision bumps or the socket kicks have run, and whether or not
 * they ever do. The owner is exempt: they can never lose their own room.
 */
export const membershipGrantsAccess = (
  membership: Pick<RoomMembership, 'role' | 'epoch'>,
  room: Pick<Room, 'membershipEpoch'>,
): boolean => membership.role === 'owner' || epochOf(membership.epoch) >= roomEpoch(room)
