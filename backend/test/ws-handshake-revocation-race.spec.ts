import { randomUUID } from 'node:crypto'

import { CLOSE_CODES, PROTOCOL_VERSION } from 'common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeFactory } from 'common/testing'
import request from 'supertest'
import type { ClientMessage, ClientOpMessage, RoomDiff } from 'common'
import type { Connection } from 'mongoose'

import { AccountTokenService } from '../src/auth/account-token.service'
import { Gate, until } from './utils/gate'
import { RoomAccessService } from '../src/realtime/room-access.service'
import { RoomOpService } from '../src/realtime/room-op.service'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, VERSION_HEADERS, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

const PASSWORD = 'ficsit-forever'

/**
 * Revocation closes the sockets it can see. A handshake still reading account state is
 * not one of them, and a message already inside the op queue is past every check the
 * gateway makes on arrival. Both windows are staged here rather than described.
 */
describe('revocation against work that is already in flight', () => {
  let context: TestContext
  let connection: Connection
  let url: string
  let owner: TestUser
  let member: TestUser
  let roomId: string
  let clients: TestClient[]
  let restore: (() => void) | null

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)

  const changePassword = (token: string, newPassword: string) =>
    request(context.app.getHttpServer())
      .post('/me/password')
      .set(VERSION_HEADERS)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword })

  const revisionOf = async () => (await connection.collection('rooms').findOne({ roomId }))?.revision

  const joined = async (token: string) => {
    const client = await TestClient.greet(url, token)
    clients.push(client)
    client.send({ type: 'join', roomId })
    await client.next('snapshot')
    await client.next('presence')
    return client
  }

  const op = (diff: RoomDiff, baseRevision: number): ClientOpMessage =>
    ({ type: 'op', roomId, opId: randomUUID(), baseRevision, diff })

  /** The socket may already be gone, which is the outcome under test, not an error. */
  const trySend = (client: TestClient, message: ClientMessage) => {
    try {
      client.send(message)
    } catch {
      // Nothing to do: a closed socket is exactly what should have happened.
    }
  }

  beforeAll(async () => {
    context = await createTestApp({ unthrottled: true })
    connection = await awaitConnection(context.app)
    url = context.wsUrl
    await buildIndexes(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    clients = []
    restore = null
    wsConnectionLimiter.reset()
    await resetRooms(context.app)
    owner = await registerAndLogin(context.app, 'owner')
    member = await registerAndLogin(context.app, 'member')
    roomId = randomUUID()
    await post('/rooms', owner).send({ roomId, name: 'Iron Line', factories: [makeFactory({ id: 1 })] })
    await post(`/rooms/${roomId}/share`, owner).send({})
    await post(`/rooms/${roomId}/join`, member).send({})
  })

  afterEach(() => {
    restore?.()
    closeAll(clients)
  })

  /**
   * The handshake reads the account, the rotation commits and closes every socket it can
   * find, and only then does the handshake finish. Winning that window used to hand the
   * connection a live session on a token that will never be accepted again.
   */
  it('refuses a handshake that was in flight when the account was revoked', async () => {
    const gate = new Gate()
    const accounts = context.app.get(AccountTokenService)
    const original = accounts.accountState.bind(accounts)
    restore = () => { accounts.accountState = original }

    accounts.accountState = async userId => {
      // Read first, then park: the state this handshake decides on is the pre-rotation one.
      const state = await original(userId)
      await gate.wait()
      return state
    }

    const client = await TestClient.open(url)
    clients.push(client)
    client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, token: member.token })
    await until(() => gate.entered === 1, 'the handshake to reach the account read')

    await changePassword(member.token, 'brand-new')
    gate.release()

    await expect(client.waitForClose(2_000)).resolves.toMatchObject({
      code: CLOSE_CODES.unauthorized,
    })
    await client.expectSilence('hello_ok')

    trySend(client, { type: 'join', roomId })
    trySend(client, op({ factories: [makeFactory({ id: 2, name: 'Won the race' })] }, 0))

    await client.expectSilence('snapshot')
    expect(await revisionOf()).toBe(0)
  })

  /**
   * One apply per room, in arrival order. An op that reached the queue before the socket
   * was revoked is past every check the gateway makes on arrival, and its own authorizer
   * still sees an intact membership: the account's tokens went, not the room's grant.
   */
  it('does not commit an op that was already queued when the socket was revoked', async () => {
    const ownerClient = await joined(owner.token)
    const memberClient = await joined(member.token)

    const gate = new Gate()
    const access = context.app.get(RoomAccessService)
    const originalAuthorize = access.authorizeWithContent.bind(access)
    const ops = context.app.get(RoomOpService)
    const originalApply = ops.apply.bind(ops)
    let queued = 0
    restore = () => {
      access.authorizeWithContent = originalAuthorize
      ops.apply = originalApply
    }

    // Parks the head of the room queue, so the next op arrives behind it.
    access.authorizeWithContent = async (id, credentials) => {
      if (gate.entered === 0) await gate.wait()
      return originalAuthorize(id, credentials)
    }
    ops.apply = (message, actor, authorize) => {
      queued += 1
      return originalApply(message, actor, authorize)
    }

    ownerClient.send(op({ factories: [makeFactory({ id: 2, name: 'Owner edit' })] }, 0))
    await until(() => gate.entered === 1, 'the owner\'s op to park in the queue')

    memberClient.send(op({ factories: [makeFactory({ id: 3, name: 'Queued behind it' })] }, 1))
    await until(() => queued === 2, 'the member\'s op to reach the queue')

    // The socket is revoked with its op already past the door.
    await changePassword(member.token, 'brand-new')
    gate.release()

    await expect(ownerClient.next('op_ack')).resolves.toMatchObject({ revision: 1 })
    await expect(memberClient.waitForClose(2_000)).resolves.toMatchObject({
      code: CLOSE_CODES.unauthorized,
    })

    // A third op behind the queued one, which is what makes the assertion exact: the
    // queue is FIFO, so this settles only after the member's op has had its turn, and
    // its own base revision is the count of what committed in between.
    ownerClient.send(op({ factories: [makeFactory({ id: 4, name: 'After the queue' })] }, 1))

    await expect(ownerClient.nextOneOf(['op_ack', 'op_reject'])).resolves.toMatchObject({
      type: 'op_ack',
      revision: 2,
    })
    expect(await revisionOf()).toBe(2)
  })
})
