import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeFactory } from 'common/testing'
import type { ClientOpMessage, RoomDiff } from 'common'
import type { Connection } from 'mongoose'

import { ConnectionRegistry } from '../src/realtime/connection-registry'
import { FlakyActivityService, TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

/**
 * The room write commits before the activity row is attempted. If that row could
 * fail the apply, the sender would get `internal_error` with no ack and its one
 * in-flight slot would never clear — every later edit blocked, on a change Mongo
 * already holds.
 */
describe('ws ops: nothing after the commit may block the ack', () => {
  let context: TestContext
  let connection: Connection
  let url: string
  let owner: TestUser
  let member: TestUser
  let roomId: string
  let clients: TestClient[]
  const activity = new FlakyActivityService()

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)

  const joined = async (token: string) => {
    const client = await TestClient.greet(url, token)
    clients.push(client)
    client.send({ type: 'join', roomId })
    await client.next('snapshot')
    await client.next('presence')
    return client
  }

  const op = (name: string, baseRevision: number): ClientOpMessage => {
    const diff: RoomDiff = { factories: [makeFactory({ id: 1, name })] }
    return { type: 'op', roomId, opId: randomUUID(), baseRevision, diff }
  }

  /**
   * The socket-write seam. Exactly one write fails, so anything the server tries to
   * say *instead* of the message it dropped still reaches the client and can be
   * asserted on.
   */
  const failNextSendTo = (userId: string) => {
    const [target] = context.app.get(ConnectionRegistry).userConnections(userId)
    const original = target.send.bind(target)
    const state = { thrown: 0 }

    target.send = message => {
      if (state.thrown > 0) return original(message)
      state.thrown += 1
      throw new Error('injected socket write failure')
    }
    return state
  }

  beforeAll(async () => {
    context = await createTestApp({ activity, unthrottled: true })
    connection = await awaitConnection(context.app)
    url = context.wsUrl
    await buildIndexes(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    clients = []
    activity.failing = false
    activity.failures = 0
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

  it('acks, broadcasts and keeps taking ops when the activity log fails', async () => {
    const sender = await joined(owner.token)
    const peer = await joined(member.token)

    activity.failing = true

    const first = op('Ingot Smelters', 0)
    sender.send(first)

    await expect(sender.next('op_ack')).resolves.toMatchObject({ opId: first.opId, revision: 1 })
    await expect(peer.next('op_apply')).resolves.toMatchObject({ roomId, revision: 1 })
    await sender.expectSilence('error')

    // The next op from the same sender goes through unaided: the client never
    // had to reconnect, and neither socket was closed under it.
    const second = op('Steel Smelters', 1)
    sender.send(second)

    await expect(sender.next('op_ack')).resolves.toMatchObject({ opId: second.opId, revision: 2 })
    await expect(peer.next('op_apply')).resolves.toMatchObject({ roomId, revision: 2 })

    expect(sender.closeInfo).toBeNull()
    expect(peer.closeInfo).toBeNull()
    expect(activity.failures).toBe(2)
    expect((await connection.collection('rooms').findOne({ roomId }))?.revision).toBe(2)
  })

  /**
   * The lost-ack recovery path, and the only op a client ever retries. The replay is
   * past a commit too — the original op's — so a write failure here must not surface
   * as `internal_error` with no ack behind it: that is precisely the state a client
   * holding one in-flight slot cannot get out of.
   */
  it('recovers a client whose ack replay could not be written to its socket', async () => {
    const sender = await joined(owner.token)
    const peer = await joined(member.token)

    const first = op('Ingot Smelters', 0)
    sender.send(first)
    await expect(sender.next('op_ack')).resolves.toMatchObject({ opId: first.opId, revision: 1 })
    await expect(peer.next('op_apply')).resolves.toMatchObject({ roomId, revision: 1 })

    // Pretend that ack never arrived: the client retries the same opId, and the
    // replay cannot be written to it. Nothing may reach the client in its place —
    // an `internal_error` here is the shape that used to escape the outer handler.
    const failing = failNextSendTo(owner.userId)
    sender.send(first)

    await sender.expectSilence('op_ack')
    await sender.expectSilence('error')
    expect(failing.thrown).toBe(1)
    expect(sender.closeInfo).toBeNull()

    // The next retry gets through, which is all the client needs; a reconnect would
    // have done just as well.
    sender.send(first)
    await expect(sender.next('op_ack')).resolves.toMatchObject({ opId: first.opId, revision: 1 })

    // Replayed, never re-applied: one revision, and the peer saw one broadcast.
    expect((await connection.collection('rooms').findOne({ roomId }))?.revision).toBe(1)
    await peer.expectSilence('op_apply')
  })
})
