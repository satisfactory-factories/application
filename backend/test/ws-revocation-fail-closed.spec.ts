import { randomUUID } from 'node:crypto'

import { CLOSE_CODES } from 'common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeFactory } from 'common/testing'
import type { ClientOpMessage, RoomDiff } from 'common'
import type { Connection } from 'mongoose'

import { FailingStepRunner, TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { RoomAccessService } from '../src/realtime/room-access.service'
import { until } from './utils/gate'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { WS_INTERNAL_ERROR } from '../src/realtime/realtime.constants'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

/**
 * A revocation lever commits in one write, and everything after it is bookkeeping that
 * can fail. If the kick rides on that bookkeeping it is skipped entirely when the
 * bookkeeping throws, and `broadcastOp` hands the owner's private plan to a socket that
 * was supposed to be gone — for as long as it stays quiet and answers pings.
 */
describe('revocation is fail-closed, whatever happens after the write', () => {
  let context: TestContext
  let connection: Connection
  let url: string
  let owner: TestUser
  let member: TestUser
  let roomId: string
  let clients: TestClient[]
  let restore: (() => void) | null
  const steps = new FailingStepRunner()

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)
  const put = (path: string, as?: TestUser) => call(context.app, 'put', path, as)
  const del = (path: string, as?: TestUser) => call(context.app, 'delete', path, as)

  const revisionOf = async () => (await connection.collection('rooms').findOne({ roomId }))?.revision

  const joined = async (token?: string, visitorToken?: string) => {
    const client = await TestClient.greet(url, token)
    clients.push(client)
    client.send({ type: 'join', roomId, visitorToken })
    await client.next('snapshot')
    await client.next('presence')
    return client
  }

  const visitorToken = async (password: string): Promise<string> =>
    (await post(`/rooms/${roomId}/auth`).send({ password })).body.visitorToken

  const op = (diff: RoomDiff, baseRevision = 0): ClientOpMessage =>
    ({ type: 'op', roomId, opId: randomUUID(), baseRevision, diff })

  /** The owner edits the plan, so any peer still in the room is fanned out to. */
  const ownerEdits = async (ownerClient: TestClient, baseRevision: number) => {
    ownerClient.send(op({ factories: [makeFactory({ id: 2, name: 'Private line' })] }, baseRevision))
    await ownerClient.next('op_ack')
  }

  beforeAll(async () => {
    context = await createTestApp({ stepRunner: steps, unthrottled: true })
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
    steps.reset()
    wsConnectionLimiter.reset()
    await resetRooms(context.app)
    owner = await registerAndLogin(context.app, 'owner')
    member = await registerAndLogin(context.app, 'member')
    roomId = randomUUID()
    await post('/rooms', owner).send({ roomId, name: 'Iron Line', factories: [makeFactory({ id: 1 })] })
    await post(`/rooms/${roomId}/share`, owner).send({})
    await post(`/rooms/${roomId}/join`, member).send({})
    await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit' })
  })

  afterEach(() => {
    restore?.()
    steps.reset()
    closeAll(clients)
  })

  describe('a password rotation whose bookkeeping fails after the write', () => {
    it('still kicks the visitor and stops fanning the plan out to them', async () => {
      const visitor = await joined(undefined, await visitorToken('ficsit'))
      const ownerClient = await joined(owner.token)

      // The hash and the version bump have committed; the revision bump has not.
      steps.failAt = 'bump-rooms-revision'
      expect((await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit-2' })).status)
        .toBe(500)
      steps.reset()

      await ownerEdits(ownerClient, 0)

      await visitor.expectSilence('op_apply')
      await visitor.expectSilence('snapshot')
      await expect(visitor.waitForClose(2_000)).resolves.toMatchObject({
        code: CLOSE_CODES.forbidden,
      })
    })

    it('leaves the member, whose access a rotation never touched', async () => {
      const memberClient = await joined(member.token)
      const ownerClient = await joined(owner.token)

      steps.failAt = 'bump-rooms-revision'
      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit-2' })
      steps.reset()

      await ownerEdits(ownerClient, 0)

      await expect(memberClient.next('op_apply')).resolves.toMatchObject({ roomId, revision: 1 })
      expect(memberClient.closeInfo).toBeNull()
    })
  })

  /**
   * Removal carries the same version bump and the same emit-after-the-chain shape, but
   * a room with no password lets every visitor in, so the sweep grants rather than
   * kicks. What has to be true is that the sweep runs at all: it is the write that owes
   * it, not the bookkeeping, and only that ordering holds when the bookkeeping throws.
   */
  describe('a password removal whose bookkeeping fails after the write', () => {
    it('still re-checks every socket in the room', async () => {
      const visitor = await joined(undefined, await visitorToken('ficsit'))
      await joined(owner.token)

      const access = context.app.get(RoomAccessService)
      const original = access.authorize.bind(access)
      let rechecks = 0
      restore = () => { access.authorize = original }
      access.authorize = (id, credentials) => {
        rechecks += 1
        return original(id, credentials)
      }

      steps.failAt = 'bump-rooms-revision'
      expect((await del(`/rooms/${roomId}/password`, owner)).status).toBe(500)
      steps.reset()

      await until(() => rechecks > 0, 'the revocation sweep to re-check the room')
      // Nobody is refused: the room is open now, which is what the removal meant.
      expect(visitor.closeInfo).toBeNull()
    })
  })

  /**
   * The other way the kick goes missing: the sweep runs but cannot read the state it
   * decides on. Guessing "still allowed" is the one answer that cannot be taken back,
   * so the socket goes — with a code it may reconnect on, because a database blip is
   * not a reason to sign anybody out.
   */
  describe('a sweep that cannot re-check the room', () => {
    it('drops the socket rather than leaving it in the room', async () => {
      const visitor = await joined(undefined, await visitorToken('ficsit'))
      const ownerClient = await joined(owner.token)

      const access = context.app.get(RoomAccessService)
      const original = access.authorize.bind(access)
      restore = () => { access.authorize = original }
      access.authorize = async () => { throw new Error('injected access read failure') }

      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit-2' })

      await expect(visitor.waitForClose(2_000)).resolves.toMatchObject({
        code: WS_INTERNAL_ERROR,
      })
      await expect(ownerClient.waitForClose(2_000)).resolves.toMatchObject({
        code: WS_INTERNAL_ERROR,
      })
      expect(await revisionOf()).toBe(0)
    })
  })
})
