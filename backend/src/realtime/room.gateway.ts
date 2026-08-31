import type { IncomingMessage } from 'node:http'

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { JwtService } from '@nestjs/jwt'
import { Model } from 'mongoose'
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets'
import { CLOSE_CODES, PROTOCOL_VERSION, WS_PATH, parseClientMessage } from 'common'
import type WebSocket from 'ws'
import type { ClientJoinMessage, ClientOpMessage, ServerMessage } from 'common'

import { ANONYMOUS_ACTOR } from '../rooms/room-activity.service'
import { AuthTokenPayload } from '../auth/auth-token'
import { Connection } from './connection'
import { ConnectionRegistry } from './connection-registry'
import { Room } from '../rooms/schemas/room.schema'
import { RoomAccess, RoomAccessService } from './room-access.service'
import { RoomEventsService } from '../rooms/room-events.service'
import type { RoomEventMap } from '../rooms/room-events.service'
import { RoomOpService } from './room-op.service'
import { RoomsService } from '../rooms/rooms.service'
import { toRoomSnapshot } from './room-snapshot'
import { verifyWsClient, wsClientIp } from './ws-upgrade'
import {
  WS_HEARTBEAT_INTERVAL_MS,
  WS_HELLO_TIMEOUT_MS,
  WS_INTERNAL_ERROR,
  WS_MAX_PAYLOAD_BYTES,
  WS_POLICY_VIOLATION,
} from './realtime.constants'

/** Just enough of a failed parse to answer the sender's op instead of the socket. */
interface OpEnvelope {
  roomId: string
  opId: string
}

@Injectable()
@WebSocketGateway({
  path: WS_PATH,
  maxPayload: WS_MAX_PAYLOAD_BYTES,
  verifyClient: verifyWsClient,
  // ws documents permessage-deflate as a memory and throughput hazard, and the
  // payload is already bounded above.
  perMessageDeflate: false,
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomGateway.name)
  private heartbeat: NodeJS.Timeout | null = null

  constructor (
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    private readonly registry: ConnectionRegistry,
    private readonly access: RoomAccessService,
    private readonly ops: RoomOpService,
    private readonly rooms: RoomsService,
    private readonly events: RoomEventsService,
    private readonly jwt: JwtService,
  ) {}

  onModuleInit (): void {
    this.events.on('rooms_changed', this.onRoomsChanged)
    this.events.on('room_meta', this.onRoomMeta)
    this.events.on('room_deleted', this.onRoomDeleted)
    this.events.on('access_revoked', this.onAccessRevoked)

    this.heartbeat = setInterval(() => this.pingAll(), WS_HEARTBEAT_INTERVAL_MS)
    this.heartbeat.unref()
  }

  onModuleDestroy (): void {
    this.events.off('rooms_changed', this.onRoomsChanged)
    this.events.off('room_meta', this.onRoomMeta)
    this.events.off('room_deleted', this.onRoomDeleted)
    this.events.off('access_revoked', this.onAccessRevoked)

    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
  }

  // ===== Socket lifecycle =====

  handleConnection (socket: WebSocket, request: IncomingMessage): void {
    const connection = new Connection(socket, wsClientIp(request))
    this.registry.add(connection)

    connection.helloTimer = setTimeout(
      () => connection.close(CLOSE_CODES.unauthorized, 'hello timeout'),
      WS_HELLO_TIMEOUT_MS,
    )

    socket.on('pong', () => { connection.isAlive = true })
    socket.on('message', (data: WebSocket.RawData) => { void this.onMessage(connection, data) })
  }

  handleDisconnect (socket: WebSocket): void {
    const connection = this.registry.get(socket)
    if (!connection) return

    const rooms = [...connection.rooms.keys()]
    connection.clearHelloTimer()
    this.registry.remove(connection)
    for (const roomId of rooms) this.broadcastPresence(roomId)
  }

  /** Public so tests can drive the heartbeat without waiting on the interval. */
  pingAll (): void {
    for (const connection of this.registry.all()) {
      if (!connection.isAlive) {
        connection.terminate()
        continue
      }
      connection.isAlive = false
      connection.ping()
    }
  }

  // ===== Message dispatch =====

  private async onMessage (connection: Connection, data: WebSocket.RawData): Promise<void> {
    if (!connection.allowMessage()) {
      connection.send(error('rate_limited', 'Too many messages.'))
      connection.close(WS_POLICY_VIOLATION, 'message rate exceeded')
      return
    }

    let raw: unknown
    try {
      raw = JSON.parse(data.toString()) as unknown
    } catch {
      connection.send(error('invalid_json', 'Message was not valid JSON.'))
      return
    }

    try {
      if (!connection.helloDone) {
        await this.handleHello(connection, raw)
        return
      }

      const parsed = parseClientMessage(raw)
      if (!parsed.success) {
        await this.rejectUnparsable(connection, raw)
        return
      }

      switch (parsed.data.type) {
        case 'hello':
          connection.send(error('already_greeted', 'This connection already said hello.'))
          break
        case 'join':
          await this.handleJoin(connection, parsed.data)
          break
        case 'op':
          await this.handleOp(connection, parsed.data)
          break
        case 'leave':
          this.handleLeave(connection, parsed.data.roomId)
          break
      }
    } catch (cause) {
      this.logger.error('Failed to handle a client message', cause)
      connection.send(error('internal_error', 'The server could not handle that message.'))
    }
  }

  // ===== hello =====

  private async handleHello (connection: Connection, raw: unknown): Promise<void> {
    // Cleared before any await, so a slow database can never be reported as 4401.
    connection.clearHelloTimer()

    const parsed = parseClientMessage(raw)
    if (!parsed.success || parsed.data.type !== 'hello') {
      connection.close(CLOSE_CODES.unauthorized, 'expected hello')
      return
    }

    const hello = parsed.data
    if (hello.protocolVersion !== PROTOCOL_VERSION) {
      connection.close(CLOSE_CODES.versionMismatch, `expected protocol ${PROTOCOL_VERSION}`)
      return
    }

    // Token verification is the only step allowed to produce 4401. Everything
    // after it can fail on the database, and must stay retryable.
    let user: AuthTokenPayload | null = null
    if (hello.token !== undefined) {
      user = this.verifyAccountToken(hello.token)
      if (!user) {
        connection.close(CLOSE_CODES.unauthorized, 'invalid token')
        return
      }
    }

    let roomsRevision: number | null = null
    try {
      if (user) roomsRevision = await this.rooms.roomsRevisionOf(user.id)
    } catch (cause) {
      this.logger.error('Handshake failed while reading the account', cause)
      connection.close(WS_INTERNAL_ERROR, 'handshake failed')
      return
    }

    connection.userId = user?.id ?? null
    connection.username = user?.username ?? null
    connection.helloDone = true
    this.registry.registerUser(connection)

    connection.send({
      type: 'hello_ok',
      protocolVersion: PROTOCOL_VERSION,
      userId: connection.userId,
      roomsRevision,
    })
  }

  /** A visitor token is signed with the same secret, so the shape is the check. */
  private verifyAccountToken (token: string): AuthTokenPayload | null {
    try {
      const payload = this.jwt.verify<AuthTokenPayload>(token)
      const valid = typeof payload?.id === 'string' && typeof payload?.username === 'string'
      return valid ? payload : null
    } catch {
      return null
    }
  }

  // ===== join / leave =====

  private async handleJoin (connection: Connection, message: ClientJoinMessage): Promise<void> {
    const access = await this.access.authorize(message.roomId, {
      userId: connection.userId,
      visitorToken: message.visitorToken,
    })

    if (access.status !== 'granted') {
      connection.send(joinRefusal(access.status, message.roomId))
      return
    }

    // The snapshot below is built from this copy and no other: it is the one the
    // access check was made against, re-read and confirmed unmoved.
    const { room } = access
    connection.rooms.set(room.roomId, { roomId: room.roomId, visitorToken: message.visitorToken })
    const joined = this.registry.joinRoom(connection, room.roomId)

    if (message.lastRevision === room.revision) {
      connection.send({ type: 'up_to_date', roomId: room.roomId, revision: room.revision })
    } else {
      connection.send({
        type: 'snapshot',
        roomId: room.roomId,
        room: toRoomSnapshot(room),
        revision: room.revision,
      })
    }

    // Occupancy only moves when a socket actually arrives. Every idle room re-joins
    // on the revision probe, so broadcasting per join was a frame to every peer in
    // every room on every client's probe tick, saying the same number each time.
    if (joined) this.broadcastPresence(room.roomId)
  }

  private handleLeave (connection: Connection, roomId: string): void {
    if (!connection.rooms.has(roomId)) return
    this.registry.leaveRoom(connection, roomId)
    this.broadcastPresence(roomId)
  }

  // ===== ops =====

  private async handleOp (connection: Connection, message: ClientOpMessage): Promise<void> {
    const session = connection.rooms.get(message.roomId)
    if (!session) {
      connection.send(error('not_joined', 'Join the room before sending ops.', message.roomId))
      return
    }

    const actor = connection.userId ?? ANONYMOUS_ACTOR
    const outcome = await this.ops.apply(message, actor, () =>
      this.access.authorize(message.roomId, {
        userId: connection.userId,
        visitorToken: session.visitorToken,
      }))

    switch (outcome.status) {
      case 'applied':
        // The write has committed. Both sends are best-effort from here: an
        // exception would reach the sender as `internal_error` with no ack, and
        // its one-in-flight slot would never clear.
        this.deliver(connection, {
          type: 'op_ack',
          roomId: message.roomId,
          opId: message.opId,
          revision: outcome.revision,
        })
        this.broadcastOp(connection, message, outcome.revision)
        break

      case 'duplicate':
        // The single in-flight retry window: replay the ack, apply nothing. Past a
        // commit here too — the original op's — so the replay is best-effort like
        // the ack it repeats, and an unwritable socket must not raise an exception
        // on the one path a client takes when its ack went missing.
        this.deliver(connection, {
          type: 'op_ack',
          roomId: message.roomId,
          opId: message.opId,
          revision: outcome.revision,
        })
        break

      case 'stale':
        connection.send({
          type: 'op_reject',
          roomId: message.roomId,
          opId: message.opId,
          reason: 'stale_base',
          snapshot: toRoomSnapshot(outcome.room),
        })
        break

      // Both refuse this op but leave the socket in the room: the sender still has
      // access, so the shared rebase path resolves it from the snapshot.
      case 'not_owner':
        connection.send({
          type: 'op_reject',
          roomId: message.roomId,
          opId: message.opId,
          reason: 'forbidden',
          snapshot: toRoomSnapshot(outcome.room),
        })
        break

      case 'too_large':
        connection.send({
          type: 'op_reject',
          roomId: message.roomId,
          opId: message.opId,
          reason: 'too_large',
          snapshot: toRoomSnapshot(outcome.room),
        })
        break

      case 'forbidden':
        connection.send({
          type: 'op_reject',
          roomId: message.roomId,
          opId: message.opId,
          reason: 'forbidden',
        })
        this.handleLeave(connection, message.roomId)
        break

      case 'gone':
        connection.send({
          type: 'op_reject',
          roomId: message.roomId,
          opId: message.opId,
          reason: 'room_deleted',
        })
        connection.send({ type: 'room_deleted', roomId: message.roomId })
        this.handleLeave(connection, message.roomId)
        break
    }
  }

  /**
   * A message that fails the schema is still answerable as an op when the sender
   * named a room it holds, which is what keeps the client's one-in-flight slot
   * from stalling on a payload the server refuses.
   */
  private async rejectUnparsable (connection: Connection, raw: unknown): Promise<void> {
    const envelope = asOpEnvelope(raw)
    const session = envelope ? connection.rooms.get(envelope.roomId) : undefined
    if (!envelope || !session) {
      connection.send(error('invalid_message', 'Message did not match the protocol.'))
      return
    }

    // The reply carries the whole room, so membership of `connection.rooms` is not
    // enough: it is set at join time and outlives a revocation until the kick lands.
    // Re-run the same check the parsed op path runs before handing the snapshot over.
    const access = await this.access.authorize(envelope.roomId, {
      userId: connection.userId,
      visitorToken: session.visitorToken,
    })

    if (access.status !== 'granted') {
      // A tombstone is told apart from a revocation, exactly as `join` and the parsed
      // op path do: the client turns its copy local either way, for different reasons.
      connection.send(access.status === 'deleted'
        ? { type: 'room_deleted', roomId: envelope.roomId }
        : error('forbidden', 'You do not have access to this room.', envelope.roomId))
      this.handleLeave(connection, envelope.roomId)
      return
    }

    connection.send({
      type: 'op_reject',
      roomId: envelope.roomId,
      opId: envelope.opId,
      reason: 'invalid',
      snapshot: toRoomSnapshot(access.room),
    })
  }

  private broadcastOp (sender: Connection, message: ClientOpMessage, revision: number): void {
    for (const peer of this.registry.roomConnections(message.roomId)) {
      if (peer === sender) continue
      this.deliver(peer, { type: 'op_apply', roomId: message.roomId, revision, diff: message.diff })
    }
  }

  private broadcastPresence (roomId: string): void {
    const count = this.registry.presence(roomId)
    for (const peer of this.registry.roomConnections(roomId)) {
      this.deliver(peer, { type: 'presence', roomId, count })
    }
  }

  /** One unwritable socket must not cost the others their message, or the sender its ack. */
  private deliver (connection: Connection, message: ServerMessage): void {
    try {
      connection.send(message)
    } catch (cause) {
      this.logger.error('Failed to deliver a message to a socket', cause)
    }
  }

  // ===== Fan-out from the rooms domain =====

  private readonly onRoomsChanged = ({ userIds }: { userIds: string[] }): void => {
    void this.fanOutRoomsChanged(userIds).catch(cause =>
      this.logger.error('Failed to fan out rooms_changed', cause))
  }

  private readonly onRoomMeta = ({ roomId }: { roomId: string }): void => {
    void this.fanOutRoomMeta(roomId).catch(cause =>
      this.logger.error('Failed to fan out room_meta', cause))
  }

  /**
   * The room is dropped from each socket, never the socket itself: one connection
   * multiplexes every synced tab, and 4403 tells the client to stop reconnecting
   * altogether — which would take the user's other tabs offline with this one.
   */
  private readonly onRoomDeleted = ({ roomId }: { roomId: string }): void => {
    for (const connection of this.registry.roomConnections(roomId)) {
      this.deliver(connection, { type: 'room_deleted', roomId })
      this.registry.leaveRoom(connection, roomId)
    }
  }

  private readonly onAccessRevoked = (event: RoomEventMap['access_revoked']): void => {
    void this.revokeAccess(event).catch(cause =>
      this.logger.error('Failed to re-check room access', cause))
  }

  private async fanOutRoomsChanged (userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      const connections = this.registry.userConnections(userId)
      if (connections.length === 0) continue

      const roomsRevision = await this.rooms.roomsRevisionOf(userId)
      for (const connection of connections) {
        this.deliver(connection, { type: 'rooms_changed', roomsRevision })
      }
    }
  }

  private async fanOutRoomMeta (roomId: string): Promise<void> {
    const connections = this.registry.roomConnections(roomId)
    if (connections.length === 0) return

    const room = await this.roomModel.findOne({ roomId, deletedAt: null }).lean()
    if (!room) return

    const meta = {
      name: room.name,
      slug: room.slug,
      shared: room.shared,
      hasPassword: room.passwordHash !== null,
    }
    for (const connection of connections) {
      this.deliver(connection, { type: 'room_meta', roomId, meta })
    }
  }

  /**
   * Re-running the real access check against the room as it now stands kicks
   * exactly the right sockets for both revocation levers: a rotation invalidates
   * visitor tokens, an unshare has voided the memberships at the epoch write.
   * `userId` narrows the sweep to one account.
   */
  private async revokeAccess (
    { roomId, scope, userId }: RoomEventMap['access_revoked'],
  ): Promise<void> {
    const connections = this.registry.roomConnections(roomId)
      .filter(connection => userId === undefined || connection.userId === userId)
    if (connections.length === 0) return

    // Leaving withdraws nothing the room itself grants — a shared room still lets
    // that account back in as a visitor — so the room is dropped from their sockets
    // rather than re-checked, and their other tabs stay on the same connection.
    if (scope === 'departed-member') {
      for (const connection of connections) this.handleLeave(connection, roomId)
      return
    }

    for (const connection of connections) {
      const session = connection.rooms.get(roomId)
      const access = await this.access.authorize(roomId, {
        userId: connection.userId,
        visitorToken: session?.visitorToken,
      })
      // Anything short of a clean grant kicks. A room that would refuse this socket
      // a join must not keep answering the one it already holds.
      if (access.status === 'granted') continue

      this.deliver(connection, error('forbidden', 'Your access to this room was revoked.', roomId))
      connection.close(CLOSE_CODES.forbidden, 'access revoked')
    }
  }
}

const error = (code: string, message: string, roomId?: string): ServerMessage =>
  ({ type: 'error', code, message, roomId })

/** A room that moved under the check is answered as a refusal, never as a snapshot. */
const joinRefusal = (status: RoomAccess['status'], roomId: string): ServerMessage => {
  if (status === 'missing') return error('room_not_found', 'That room does not exist.', roomId)
  if (status === 'deleted') return { type: 'room_deleted', roomId }
  return error('forbidden', 'You do not have access to this room.', roomId)
}

const asOpEnvelope = (raw: unknown): OpEnvelope | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const candidate = raw as Partial<ClientOpMessage>
  if (candidate.type !== 'op') return null
  if (typeof candidate.roomId !== 'string' || typeof candidate.opId !== 'string') return null
  return { roomId: candidate.roomId, opId: candidate.opId }
}
