import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeFactory } from 'common/testing'
import type { ClientOpMessage, RoomDiff } from 'common'
import type { Connection } from 'mongoose'

import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

/**
 * `connection.rooms` records what a socket joined, never what it may still read: the
 * epoch write voids a membership instantly and the kick that follows it can be lost.
 * So every reply carrying room content re-runs the access check, and a member who
 * leaves stops being fanned out to on the socket they were already holding.
 */
describe('a socket that outlived its access', () => {
  let context: TestContext
  let connection: Connection
  let url: string
  let owner: TestUser
  let member: TestUser
  let roomId: string
  let clients: TestClient[]

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)

  const joined = async (token: string) => {
    const client = await TestClient.greet(url, token)
    clients.push(client)
    client.send({ type: 'join', roomId })
    await client.next('snapshot')
    await client.next('presence')
    return client
  }

  const op = (diff: RoomDiff, baseRevision = 0): ClientOpMessage =>
    ({ type: 'op', roomId, opId: randomUUID(), baseRevision, diff })

  /** A frame that parses as an op envelope and fails the schema. */
  const malformed = () => ({
    type: 'op',
    roomId,
    opId: randomUUID(),
    baseRevision: 0,
    diff: { factories: [{ id: 'not-a-number' }] },
  })

  /**
   * The epoch write on its own, with nothing announcing it — the state a lost
   * event, a crashed listener or a second process leaves behind.
   */
  const revokeSilently = async () => {
    await connection.collection('rooms').updateOne(
      { roomId },
      { $set: { shared: false }, $inc: { membershipEpoch: 1 } },
    )
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
    closeAll(clients)
  })

  describe('revoked mid-session, with the kick never delivered', () => {
    it('answers a malformed frame with forbidden instead of the whole room', async () => {
      const memberClient = await joined(member.token)
      await revokeSilently()

      memberClient.sendRaw(malformed())

      await expect(memberClient.next('error')).resolves.toMatchObject({ code: 'forbidden', roomId })
      // The reject carries a full snapshot, which is exactly what must not be handed
      // to a socket whose access the epoch has already taken away.
      await memberClient.expectSilence('op_reject')
    })

    it('drops the room from that socket, so a second try is not even in the room', async () => {
      const memberClient = await joined(member.token)
      await revokeSilently()

      memberClient.sendRaw(malformed())
      await memberClient.next('error')

      memberClient.sendRaw(malformed())
      await expect(memberClient.next('error')).resolves.toMatchObject({ code: 'invalid_message' })
      // The socket itself survives: one connection carries every synced tab.
      expect(memberClient.socket.readyState).toBe(1)
    })

    it('refuses a well-formed op from the same socket', async () => {
      const memberClient = await joined(member.token)
      await revokeSilently()

      memberClient.send(op({ factories: [makeFactory({ id: 2, name: 'Sneaked in' })] }))

      await expect(memberClient.next('op_reject')).resolves.toMatchObject({ reason: 'forbidden' })
      expect((await connection.collection('rooms').findOne({ roomId }))?.revision).toBe(0)
    })

    // Same shape, different cause, and the client turns its copy local for a
    // different reason — so the tombstone is named rather than reported as a refusal.
    it('names a tombstone that landed under the socket', async () => {
      const memberClient = await joined(member.token)
      await connection.collection('rooms').updateOne({ roomId }, { $set: { deletedAt: new Date() } })

      memberClient.sendRaw(malformed())

      await expect(memberClient.next('room_deleted')).resolves.toMatchObject({ roomId })
      await memberClient.expectSilence('op_reject')
    })

    it('still answers the owner\'s malformed frame with a snapshot', async () => {
      const ownerClient = await joined(owner.token)
      await revokeSilently()

      const frame = malformed()
      ownerClient.sendRaw(frame)

      const rejected = await ownerClient.next('op_reject')
      expect(rejected).toMatchObject({ opId: frame.opId, reason: 'invalid' })
      expect(rejected.snapshot?.revision).toBe(0)
      expect(ownerClient.socket.readyState).toBe(1)
    })
  })

  describe('a member who leaves', () => {
    it('stops receiving the room on the socket they were already holding', async () => {
      const memberClient = await joined(member.token)
      const ownerClient = await joined(owner.token)

      expect((await post(`/rooms/${roomId}/leave`, member)).status).toBe(200)
      // The occupancy the owner sees is the receipt that the drop already happened.
      await expect(ownerClient.next('presence')).resolves.toMatchObject({ roomId, count: 1 })

      ownerClient.send(op({ factories: [makeFactory({ id: 2, name: 'After the leave' })] }))
      await expect(ownerClient.next('op_ack')).resolves.toMatchObject({ revision: 1 })

      await memberClient.expectSilence('op_apply')
      // Dropped from the room, not disconnected — their other tabs ride this socket.
      expect(memberClient.socket.readyState).toBe(1)
      await expect(memberClient.next('rooms_changed')).resolves.toMatchObject({
        type: 'rooms_changed',
      })
    })

    it('leaves that socket usable for another room', async () => {
      const other = randomUUID()
      await post('/rooms', member).send({ roomId: other, name: 'Copper Line' })

      const memberClient = await joined(member.token)
      await post(`/rooms/${roomId}/leave`, member)

      memberClient.send({ type: 'join', roomId: other })
      await expect(memberClient.next('snapshot')).resolves.toMatchObject({ roomId: other })
    })
  })
})
