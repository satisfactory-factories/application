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

/** A room as the server hands it out. Never carries `passwordHash`. */
export interface RoomSnapshot {
  roomId: string
  name: string
  slug: string | null
  shared: boolean
  hasPassword: boolean
  factories: Factory[]
  powerTarget: number
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

export interface ClientOpMessage {
  type: 'op'
  roomId: string
  opId: string
  baseRevision: number
  diff: RoomDiff
}

export interface ClientLeaveMessage {
  type: 'leave'
  roomId: string
}

export type ClientMessage =
  | ClientHelloMessage
  | ClientJoinMessage
  | ClientOpMessage
  | ClientLeaveMessage

export type ClientMessageType = ClientMessage['type']

// ===== Server -> client =====

export interface ServerHelloOkMessage {
  type: 'hello_ok'
  protocolVersion: string
  /** null for an anonymous visitor. */
  userId: string | null
  roomsRevision: number | null
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
  | ServerErrorMessage

export type ServerMessageType = ServerMessage['type']
