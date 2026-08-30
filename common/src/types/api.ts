import type { Factory, FactoryGroup } from './factory'
import type { RoomListEntry } from './protocol'
import type { SyncedPreferences } from '../schemas/preferences'

/**
 * The REST half of the contract. `protocol.ts` covers the socket; these are the
 * bodies the HTTP routes accept and return, so the client's types are the
 * server's rather than a hand-copy of them.
 */

// ===== Auth =====

/** The JWT payload: `{ id, username }`, HS256, 30d. */
export interface AuthTokenClaims {
  id: string
  username: string
  iat?: number
  exp?: number
}

export interface LoginResponse {
  token: string
}

export interface MessageResponse {
  message: string
}

export interface ValidateTokenResponse {
  valid: true
  decoded: AuthTokenClaims
}

// ===== Rooms =====

/** `resumed` means a half-written create was finished rather than started afresh. */
export type EnsureRoomStatus = 'created' | 'resumed' | 'already_exists'

export interface EnsureRoomResult {
  status: EnsureRoomStatus
  room: RoomListEntry
}

export interface JoinRoomResult {
  status: 'joined' | 'already_member'
  room: RoomListEntry
}

/** What rename/share/unshare hand back. */
export interface RoomEnvelope {
  room: RoomListEntry
}

export interface RoomPasswordResult {
  passwordVersion: number
}

export interface RoomAuthResult {
  visitorToken: string
}

export interface LeaveRoomResult {
  status: 'left'
}

export interface DeleteRoomResult {
  status: 'deleted'
}

/** Content a room can be created or adopted with; the shape a tab has locally. */
export interface RoomContentPayload {
  factories?: Factory[]
  powerTarget?: number
  depotUploadTier?: number
  depotExpansionTier?: number
  plannerVersion?: string
  groups?: FactoryGroup[]
}

export interface CreateRoomBody extends RoomContentPayload {
  /** A local tab keeps its UUID when it becomes a room, so identity never changes. */
  roomId?: string
  name: string
}

export interface AdoptRoomBody extends RoomContentPayload {
  roomId: string
  name: string
}

/** Every failure the rooms API can return; the client switches on `code`. */
export type RoomErrorCode =
  | 'room_not_found'
  | 'room_id_taken'
  | 'forbidden'
  | 'not_shared'
  | 'slug_taken'
  | 'invalid_slug'
  | 'invalid_password'
  | 'password_required'
  | 'no_password_set'
  | 'owner_cannot_leave'
  | 'too_many_rooms'
  | 'too_many_memberships'
  | 'invalid_payload'
  | 'revision_mismatch'

export interface RoomErrorBody {
  code: RoomErrorCode
  message: string
}

// ===== Legacy blob adoption =====

export type LegacyImportSkipReason = 'already_imported' | 'not_eligible' | 'no_legacy_data'

export interface LegacyImportResult {
  imported: boolean
  reason?: LegacyImportSkipReason
  room?: RoomListEntry
}

// ===== Preferences =====

export interface PreferencesState {
  prefs: SyncedPreferences
  revision: number
}

// ===== Snapshot share links =====

export interface ShareCreatedResponse {
  status: 'success'
  shareId: string
}

export interface ShareResponse {
  data: unknown
}
