import { randomUUID } from 'node:crypto'

import { CLOSE_CODES } from 'common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeFactory } from 'common/testing'
import type { ClientOpMessage, RoomDiff } from 'common'
import type { Connection } from 'mongoose'

import { EnsureStep } from '../src/rooms/ensure-step.runner'
import { FailingStepRunner, TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

/**
 * Unshare's first write both clears `shared` and bumps `membershipEpoch`, which
 * voids every non-owner membership. Everything after it is cleanup, so whichever
 * of those steps dies, the collaborator is already out — row still on disk, socket
 * still open, and nothing it can do with either.
 */
describe('unshare revocation survives a partial chain', () => {
  let context: TestContext
  let connection: Connection
  let url: string
  let owner: TestUser
  let member: TestUser
  let roomId: string
  let clients: TestClient[]
  const runner = new FailingStepRunner()

  const get = (path: string, as?: TestUser) => call(context.app, 'get', path, as)
  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)

  const greet = async (token?: string) => {
    const client = await TestClient.greet(url, token)
    clients.push(client)
    return client
  }

  /** Greets, joins and drains the snapshot plus the presence the join produces. */
  const joined = async (token: string) => {
    const client = await greet(token)
    client.send({ type: 'join', roomId })
    await client.next('snapshot')
    await client.next('presence')
    return client
  }

  const op = (diff: RoomDiff, baseRevision = 0): ClientOpMessage =>
    ({ type: 'op', roomId, opId: randomUUID(), baseRevision, diff })

  const membershipRows = (userId: string) =>
    connection.collection('room_memberships').countDocuments({ roomId, userId })

  beforeAll(async () => {
    context = await createTestApp({ stepRunner: runner, unthrottled: true })
    connection = await awaitConnection(context.app)
    url = context.wsUrl
    await buildIndexes(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    clients = []
    runner.reset()
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

  it.each(['bump-rooms-revision', 'remove-memberships'])(
    'locks the member out of a chain that died at %s',
    async step => {
      const memberClient = await joined(member.token)
      const ownerClient = await joined(owner.token)

      runner.failAt = step as EnsureStep
      expect((await post(`/rooms/${roomId}/unshare`, owner).send({})).status).toBe(500)
      runner.reset()

      // The row outlives the failure. The epoch is what makes it worthless.
      expect(await membershipRows(member.userId)).toBe(1)
      const room = await connection.collection('rooms').findOne({ roomId })
      expect(room?.shared).toBe(false)
      expect(room?.membershipEpoch).toBe(1)

      // The kick rides on the epoch write rather than on the cleanup, so the socket
      // that was already in the room is gone before the owner can retry the chain.
      await expect(memberClient.next('error')).resolves.toMatchObject({ code: 'forbidden', roomId })
      await expect(memberClient.waitForClose()).resolves.toMatchObject({
        code: CLOSE_CODES.forbidden,
      })
      await memberClient.expectSilence('snapshot')

      // And a fresh socket is refused the join outright.
      const reconnected = await greet(member.token)
      reconnected.send({ type: 'join', roomId })
      await expect(reconnected.next('error')).resolves.toMatchObject({ code: 'forbidden', roomId })
      await reconnected.expectSilence('snapshot')

      expect((await get('/rooms', member)).body.rooms).toEqual([])

      // The owner never loses their own room, by any route.
      expect((await get('/rooms', owner)).body.rooms).toHaveLength(1)
      ownerClient.send(op({ name: 'Still mine' }))
      await expect(ownerClient.next('op_ack')).resolves.toMatchObject({ revision: 1 })
      expect((await connection.collection('rooms').findOne({ roomId }))?.name).toBe('Still mine')
    },
  )

  it('revokes completely when only the activity row fails', async () => {
    const memberClient = await joined(member.token)
    runner.failAt = 'record-activity'

    // Best-effort by design: the revocation landed, so reporting a failure would
    // invite the owner to retry something already done.
    expect((await post(`/rooms/${roomId}/unshare`, owner).send({})).status).toBe(200)
    runner.reset()

    await expect(memberClient.waitForClose()).resolves.toMatchObject({ code: CLOSE_CODES.forbidden })
    expect(await membershipRows(member.userId)).toBe(0)
    expect((await get('/rooms', member)).body.rooms).toEqual([])
  })

  it('leaves access untouched when the first write itself fails', async () => {
    runner.failAt = 'update-room-meta'
    expect((await post(`/rooms/${roomId}/unshare`, owner).send({})).status).toBe(500)
    runner.reset()

    const room = await connection.collection('rooms').findOne({ roomId })
    expect(room?.shared).toBe(true)
    expect(room?.membershipEpoch).toBe(0)
    expect((await get('/rooms', member)).body.rooms).toHaveLength(1)

    const memberClient = await joined(member.token)
    memberClient.send(op({ factories: [makeFactory({ id: 2, name: 'Still allowed' })] }))
    await expect(memberClient.next('op_ack')).resolves.toMatchObject({ revision: 1 })
  })

  it('re-grants after a re-share only through a fresh join', async () => {
    runner.failAt = 'remove-memberships'
    expect((await post(`/rooms/${roomId}/unshare`, owner).send({})).status).toBe(500)
    runner.reset()

    // Re-shared behind a password, so nothing but a membership can open the door.
    expect((await post(`/rooms/${roomId}/share`, owner).send({})).status).toBe(200)
    await call(context.app, 'put', `/rooms/${roomId}/password`, owner).send({ password: 'ficsit' })

    // The row survived both the unshare and the re-share, and still grants nothing.
    expect(await membershipRows(member.userId)).toBe(1)
    expect((await get('/rooms', member)).body.rooms).toEqual([])
    const stale = await greet(member.token)
    stale.send({ type: 'join', roomId })
    await expect(stale.next('error')).resolves.toMatchObject({ code: 'forbidden' })

    // A live membership would answer `already_member` here; a voided one is asked
    // for the password like any newcomer.
    const refused = await post(`/rooms/${roomId}/join`, member).send({})
    expect(refused.status).toBe(401)
    expect(refused.body.code).toBe('password_required')

    const { body } = await post(`/rooms/${roomId}/auth`).send({ password: 'ficsit' })
    const rejoin = await post(`/rooms/${roomId}/join`, member).send({ visitorToken: body.visitorToken })
    expect(rejoin.body.status).toBe('joined')

    // Re-stamped in place: one row, current epoch, access back.
    expect(await membershipRows(member.userId)).toBe(1)
    expect((await get('/rooms', member)).body.rooms).toHaveLength(1)
    const rejoined = await joined(member.token)
    rejoined.send(op({ factories: [makeFactory({ id: 2, name: 'Back in' })] }))
    await expect(rejoined.next('op_ack')).resolves.toMatchObject({ revision: 1 })
  })
})
