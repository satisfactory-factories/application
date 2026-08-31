import type { Factory, FactoryGroup } from './factory'

/**
 * Bumped whenever a client and a server stop being able to understand each other.
 * Tracks the app's major/minor, not its patch: a patch never changes the wire.
 */
export const PROTOCOL_VERSION = '7.0'

/**
 * Header every REST call must carry, matched against `PROTOCOL_VERSION`. Only
 * `GET /health` and `GET /share/:id` are exempt; everything else 426s without it.
 */
export const APP_VERSION_HEADER = 'X-App-Version'

/** The gateway shares the API's HTTP server; this is the only path it answers on. */
export const WS_PATH = '/ws'

/** Body of a 426. The client keys the persistent refresh prompt off `code`. */
export interface VersionMismatchBody {
  code: 'version_mismatch'
  message: string
  requiredVersion: string
  receivedVersion: string | null
}

/** Body of the 410 returned by the retired blob-sync routes. */
export interface EndpointRemovedBody {
  code: 'endpoint_removed'
  message: string
}

/** Close codes that mean something beyond "the socket dropped". */
export const CLOSE_CODES = {
  /** No usable token. The client stops reconnecting and signs the user out. */
  unauthorized: 4401,
  /** Authenticated but no longer allowed in this room. The client stops reconnecting. */
  forbidden: 4403,
  /** Protocol version rejected. The client shows the persistent refresh prompt. */
  versionMismatch: 4426,
} as const

export type CloseCode = typeof CLOSE_CODES[keyof typeof CLOSE_CODES]

/**
 * How long a field lock survives with nothing happening to it. Keystrokes renew it,
 * so this is the idle window before someone else may claim the field. Shared with the
 * client because a lock it was told about may be dropped from the display this long
 * after the frame that announced it, without waiting for the server's sweep.
 */
export const FIELD_LOCK_TTL_MS = 10_000

/** Owner can do anything; member can only write content. */
export type RoomRole = 'owner' | 'member'

/** One row of the tab bar: room metadata plus this user's place in it. */
export interface RoomListEntry {
  roomId: string
  name: string
  slug: string | null
  shared: boolean
  hasPassword: boolean
  revision: number
  role: RoomRole
  order: number
  /** ISO 8601. When the plan itself last changed, for the "last changed" line. */
  lastActivityAt: string
}

/**
 * `GET /rooms`. `roomsRevision` is the account-wide counter every meta mutation
 * bumps, so a client can tell "my list changed" from "nothing changed".
 */
export interface RoomListResponse {
  roomsRevision: number
  rooms: RoomListEntry[]
}

/** `GET /rooms/by-slug/:slug`: enough to show the join prompt, no content. */
export interface RoomSlugLookup {
  roomId: string
  name: string
  hasPassword: boolean
}

/**
 * A room as the server hands it out. Never carries `passwordHash`.
 *
 * The four tab-owned settings below `factories` travel with the plan rather than the
 * browser: they describe the save the plan is written against, so a synced tab that
 * dropped them would resize somebody else's plan on every device but the one it was set on.
 */
export interface RoomSnapshot {
  roomId: string
  name: string
  slug: string | null
  shared: boolean
  hasPassword: boolean
  factories: Factory[]
  powerTarget: number
  depotUploadTier?: number
  depotExpansionTier?: number
  plannerVersion?: string
  groups: FactoryGroup[]
  revision: number
  createdBy: string
}

/**
 * The mutable half of a room; absent fields are unchanged. Factories are whole
 * records rather than field-level patches, because the sender has already
 * recalculated: a receiver replaces by id and recalculates nothing.
 */
export interface RoomDiff {
  name?: string
  powerTarget?: number
  /**
   * Absent means "unchanged", never "cleared". Nothing in the planner clears these back to
   * absent once set — a tier is only ever written as a clamped number and `plannerVersion`
   * is only ever stamped — so the diff needs no way to say so.
   */
  depotUploadTier?: number
  depotExpansionTier?: number
  plannerVersion?: string
  groups?: FactoryGroup[]
  factories?: Factory[]
  removedFactoryIds?: number[]
}

/** Room fields that change without a content op. */
export interface RoomMeta {
  name: string
  slug: string | null
  shared: boolean
  hasPassword: boolean
}

// ===== Client -> server =====

export interface ClientHelloMessage {
  type: 'hello'
  protocolVersion: string
  /** Account JWT. Absent for an anonymous visitor. */
  token?: string
}

export interface ClientJoinMessage {
  type: 'join'
  roomId: string
  /** The revision the client already holds; the server answers `up_to_date` when it matches. */
  lastRevision?: number
  visitorToken?: string
}

/**
 * Removals past this in a single op are a whole-plan replacement rather than an edit, and
 * the server refuses one that does not say so. Nothing but a bulk action — clear, paste,
 * template, demo — legitimately produces that many, so an undeclared burst is a truncated
 * client about to empty the room for everybody in it.
 */
export const BULK_REMOVAL_THRESHOLD = 5

export interface ClientOpMessage {
  type: 'op'
  roomId: string
  opId: string
  baseRevision: number
  diff: RoomDiff
  /**
   * "The user replaced this plan wholesale." Required above `BULK_REMOVAL_THRESHOLD`
   * removals; only the bulk paths declare it, so a diff that shrank by accident cannot
   * carry it.
   */
  bulkRemoval?: boolean
}

export interface ClientLeaveMessage {
  type: 'leave'
  roomId: string
}

/**
 * Claim or renew an advisory lock on one input, so nobody else edits it while this
 * user is in it. Field keys are opaque to the server; the client's scheme starts at
 * `notes:<factoryId>`, so covering another field is client wiring alone.
 */
export interface ClientLockMessage {
  type: 'lock'
  roomId: string
  fieldKey: string
}

/** Released on blur. Expiry and a dropped socket release a lock without one of these. */
export interface ClientUnlockMessage {
  type: 'unlock'
  roomId: string
  fieldKey: string
}

export type ClientMessage =
  | ClientHelloMessage
  | ClientJoinMessage
  | ClientOpMessage
  | ClientLeaveMessage
  | ClientLockMessage
  | ClientUnlockMessage

export type ClientMessageType = ClientMessage['type']

// ===== Server -> client =====

export interface ServerHelloOkMessage {
  type: 'hello_ok'
  protocolVersion: string
  /** null for an anonymous visitor. */
  userId: string | null
  roomsRevision: number | null
  /**
   * This socket's own id, and the whole of how a `field_locks` frame is read: a lock
   * whose `holder` matches it is this client's. Per connection rather than per account,
   * because a visitor has no `userId` and two tabs of one account must not share a lock.
   */
  connectionId: string
}

export interface ServerSnapshotMessage {
  type: 'snapshot'
  roomId: string
  room: RoomSnapshot
  revision: number
}

export interface ServerUpToDateMessage {
  type: 'up_to_date'
  roomId: string
  revision: number
}

export interface ServerOpAckMessage {
  type: 'op_ack'
  roomId: string
  opId: string
  revision: number
}

export interface ServerOpApplyMessage {
  type: 'op_apply'
  roomId: string
  revision: number
  diff: RoomDiff
}

export type OpRejectReason =
  | 'stale_base'
  | 'invalid'
  | 'forbidden'
  | 'room_deleted'
  | 'too_large'
  /** Over-threshold removals with no `bulkRemoval`. The sender re-baselines off the snapshot. */
  | 'undeclared_bulk_removal'

export interface ServerOpRejectMessage {
  type: 'op_reject'
  roomId: string
  opId: string
  reason: OpRejectReason
  /**
   * The rebase path adopts this, overlays intent and resends. Absent only when
   * the room is no longer readable at all (`forbidden`, `room_deleted`), where
   * there is nothing to rebase onto.
   */
  snapshot?: RoomSnapshot
}

export interface ServerRoomMetaMessage {
  type: 'room_meta'
  roomId: string
  meta: RoomMeta
}

export interface ServerRoomDeletedMessage {
  type: 'room_deleted'
  roomId: string
}

export interface ServerRoomsChangedMessage {
  type: 'rooms_changed'
  roomsRevision: number
}

export interface ServerPresenceMessage {
  type: 'presence'
  roomId: string
  count: number
}

/** One field somebody is editing. `holder` is the holder's `connectionId`. */
export interface FieldLock {
  fieldKey: string
  holder: string
}

/**
 * Every lock the room holds, restated in full on every change and sent to a joiner
 * arriving into a room that holds any. Advisory: the op path neither reads nor
 * enforces them, so a stale lock costs a disabled input and never an edit.
 */
export interface ServerFieldLocksMessage {
  type: 'field_locks'
  roomId: string
  locks: FieldLock[]
}

export interface ServerErrorMessage {
  type: 'error'
  code: string
  message: string
  roomId?: string
}

export type ServerMessage =
  | ServerHelloOkMessage
  | ServerSnapshotMessage
  | ServerUpToDateMessage
  | ServerOpAckMessage
  | ServerOpApplyMessage
  | ServerOpRejectMessage
  | ServerRoomMetaMessage
  | ServerRoomDeletedMessage
  | ServerRoomsChangedMessage
  | ServerPresenceMessage
  | ServerFieldLocksMessage
  | ServerErrorMessage

export type ServerMessageType = ServerMessage['type']
