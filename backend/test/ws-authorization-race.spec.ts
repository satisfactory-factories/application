import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getModelToken } from '@nestjs/mongoose'
import { makeFactory } from 'common/testing'
import type { ClientOpMessage, RoomDiff } from 'common'
import type { Connection, Model } from 'mongoose'

import { OpAuthorizer, RoomOpService } from '../src/realtime/room-op.service'
import { Room } from '../src/rooms/schemas/room.schema'
import { RoomAccessService } from '../src/realtime/room-access.service'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

/**
 * Reading the room and reading the membership are two operations, and an unshare
 * fits between them: the row still says "member" and the room copy still says
 * "shared", so the pair authorises a snapshot of a room that is already private.
 * The kick does not close it — the frame is already executing, and event delivery
 * is asynchronous. Every case here stages that gap deterministically.
 */
describe('authorization against a room that moved under the check', () => {
  let context: TestContext
  let connection: Connection
  let url: string
  let owner: TestUser
  let member: TestUser
  let roomId: string
  let clients: TestClient[]
  let restore: (() => void) | null

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)
  const put = (path: string, as?: TestUser) => call(context.app, 'put', path, as)

  const rooms = () => context.app.get<Model<Room>>(getModelToken(Room.name))
  const revisionOf = async () => (await connection.collection('rooms').findOne({ roomId }))?.revision

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

  const malformed = () => ({
    type: 'op',
    roomId,
    opId: randomUUID(),
    baseRevision: 0,
    diff: { factories: [{ id: 'not-a-number' }] },
  })

  /**
   * Unshare's first and decisive write, on its own: the room is private and the
   * epoch has advanced, while the membership row it voided has not been cleaned up
   * yet. Emitting nothing is the point — this is the window, not the kick.
   */
  const unshareSilently = async () => {
    await connection.collection('rooms').updateOne(
      { roomId },
      { $set: { shared: false }, $inc: { membershipEpoch: 1 } },
    )
  }

  /**
   * The seam: `work` runs once, after a room read and before the membership read
   * that decides on it. Everything downstream is the real code path.
   */
  const inTheGap = (work: () => Promise<void>) => {
    const access = context.app.get(RoomAccessService)
    const original = access.resolve.bind(access)
    const state = { entered: 0 }

    access.resolve = async (room, credentials) => {
      if (state.entered === 0) {
        state.entered += 1
        await work()
      }
      return original(room, credentials)
    }

    restore = () => { access.resolve = original }
    return state
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

  describe('unshare lands between the room read and the membership read', () => {
    it('refuses the join instead of answering it with the pre-unshare snapshot', async () => {
      const client = await TestClient.greet(url, member.token)
      clients.push(client)
      const gap = inTheGap(unshareSilently)

      client.send({ type: 'join', roomId })

      await expect(client.next('error')).resolves.toMatchObject({ code: 'forbidden', roomId })
      await client.expectSilence('snapshot')
      expect(gap.entered).toBe(1)
    })

    it('refuses a malformed frame instead of answering it with that snapshot', async () => {
      const client = await joined(member.token)
      const gap = inTheGap(unshareSilently)

      client.sendRaw(malformed())

      await expect(client.next('error')).resolves.toMatchObject({ code: 'forbidden', roomId })
      await client.expectSilence('op_reject')
      expect(gap.entered).toBe(1)
    })

    it('refuses an in-flight op and leaves the room exactly as it was', async () => {
      const client = await joined(member.token)
      const gap = inTheGap(unshareSilently)

      client.send(op({ factories: [makeFactory({ id: 2, name: 'Sneaked in' })] }))

      await expect(client.next('op_reject')).resolves.toMatchObject({ reason: 'forbidden' })
      expect(await revisionOf()).toBe(0)
      expect(gap.entered).toBe(1)
    })

    // The owner is exempt at every layer, so the same gap costs them a retry of the
    // consistency loop and nothing else.
    it('still admits the owner, whose access the epoch cannot withdraw', async () => {
      const client = await TestClient.greet(url, owner.token)
      clients.push(client)
      const gap = inTheGap(unshareSilently)

      client.send({ type: 'join', roomId })

      await expect(client.next('snapshot')).resolves.toMatchObject({ roomId })
      expect(gap.entered).toBe(1)
    })

    it('still answers the owner\'s malformed frame with a snapshot', async () => {
      const client = await joined(owner.token)
      inTheGap(unshareSilently)

      const frame = malformed()
      client.sendRaw(frame)

      await expect(client.next('op_reject')).resolves.toMatchObject({
        opId: frame.opId,
        reason: 'invalid',
      })
    })

    it('still commits the owner\'s in-flight op', async () => {
      const client = await joined(owner.token)
      inTheGap(unshareSilently)

      client.send(op({ factories: [makeFactory({ id: 2, name: 'Owner edit' })] }))

      await expect(client.next('op_ack')).resolves.toMatchObject({ revision: 1 })
      expect(await revisionOf()).toBe(1)
    })
  })

  /**
   * The other end of the same window. Authorization can be sound at the instant it
   * is made and revoked before the write reaches Mongo, and unshare bumps
   * `membershipEpoch` rather than `revision` — so the revision guard alone would
   * let that write through. The authorizer here grants against a room copy that has
   * since moved, which is exactly the state the guard exists to catch.
   */
  describe('the write guard, when access is withdrawn after the check', () => {
    const staleAuthorizer = async (
      role: 'owner' | 'member' | 'visitor',
      credentials: { userId: string | null, visitorToken?: string },
    ): Promise<OpAuthorizer> => {
      const stale = await rooms().findOne({ roomId }).lean()
      if (!stale) throw new Error('the room under test disappeared')

      const access = context.app.get(RoomAccessService)
      let first = true
      return async () => {
        if (first) {
          first = false
          return { status: 'granted', role, room: stale }
        }
        // The re-read the guard miss is meant to be distinguished by.
        return access.authorizeWithContent(roomId, credentials)
      }
    }

    it('refuses a member\'s write authorized against the pre-unshare room', async () => {
      const authorize = await staleAuthorizer('member', { userId: member.userId })
      await unshareSilently()

      const outcome = await context.app.get(RoomOpService).apply(
        op({ factories: [makeFactory({ id: 2, name: 'Sneaked in' })] }),
        member.userId,
        authorize,
      )

      expect(outcome.status).toBe('forbidden')
      expect(await revisionOf()).toBe(0)
    })

    it('refuses a visitor\'s write authorized against the pre-rotation room', async () => {
      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit' })
      const { body } = await post(`/rooms/${roomId}/auth`).send({ password: 'ficsit' })
      const visitorToken = body.visitorToken as string

      const authorize = await staleAuthorizer('visitor', { userId: null, visitorToken })
      await put(`/rooms/${roomId}/password`, owner).send({ password: 'pioneer' })

      const outcome = await context.app.get(RoomOpService).apply(
        op({ factories: [makeFactory({ id: 2, name: 'Sneaked in' })] }),
        'anon',
        authorize,
      )

      expect(outcome.status).toBe('forbidden')
      expect(await revisionOf()).toBe(0)
    })

    it('lets the owner\'s write through, epoch bump and all', async () => {
      const authorize = await staleAuthorizer('owner', { userId: owner.userId })
      await unshareSilently()

      const outcome = await context.app.get(RoomOpService).apply(
        op({ factories: [makeFactory({ id: 2, name: 'Owner edit' })] }),
        owner.userId,
        authorize,
      )

      expect(outcome).toMatchObject({ status: 'applied', revision: 1 })
      expect(await revisionOf()).toBe(1)
    })
  })
})
