import { randomUUID } from 'node:crypto'

import { CAPS } from 'common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeFactory } from 'common/testing'
import type { ClientOpMessage, Factory, RoomDiff } from 'common'
import type { Connection } from 'mongoose'

import { APPLIED_OPS_RING } from '../src/rooms/schemas/room.schema'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

describe('ws ops: the consistency contract', () => {
  let context: TestContext
  let connection: Connection
  let url: string
  let owner: TestUser
  let member: TestUser
  let roomId: string
  let clients: TestClient[]

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)

  const greet = async (token?: string) => {
    const client = await TestClient.greet(url, token)
    clients.push(client)
    return client
  }

  /** Greets, joins and drains the snapshot + presence the join produces. */
  const joined = async (token?: string) => {
    const client = await greet(token)
    client.send({ type: 'join', roomId })
    const snapshot = await client.next('snapshot')
    await client.next('presence')
    return { client, revision: snapshot.revision }
  }

  const op = (diff: RoomDiff, baseRevision: number, opId = randomUUID()): ClientOpMessage =>
    ({ type: 'op', roomId, opId, baseRevision, diff })

  const readRoom = () => connection.collection('rooms').findOne({ roomId })

  const named = (id: number, name: string): Factory => makeFactory({ id, name })

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
    await post('/rooms', owner).send({
      roomId,
      name: 'Iron Line',
      factories: [named(1, 'Smelters'), named(2, 'Constructors')],
    })
    await post(`/rooms/${roomId}/share`, owner).send({})
    await post(`/rooms/${roomId}/join`, member).send({})
  })

  afterEach(() => {
    closeAll(clients)
  })

  describe('a single op', () => {
    it('acks the sender at the new revision and applies it to everyone else', async () => {
      const a = await joined(owner.token)
      const b = await joined(member.token)

      const sent = op({ factories: [named(1, 'Ingot Smelters')] }, 0)
      a.client.send(sent)

      await expect(a.client.next('op_ack')).resolves.toMatchObject({
        roomId,
        opId: sent.opId,
        revision: 1,
      })
      const applied = await b.client.next('op_apply')
      expect(applied).toMatchObject({ roomId, revision: 1 })
      expect(applied.diff.factories?.[0].name).toBe('Ingot Smelters')

      const room = await readRoom()
      expect(room?.revision).toBe(1)
      expect(room?.factories.map((factory: Factory) => factory.name))
        .toEqual(['Ingot Smelters', 'Constructors'])
    })

    it('never echoes the op back to its sender', async () => {
      const a = await joined(owner.token)

      a.client.send(op({ name: 'Renamed by op' }, 0))
      await a.client.next('op_ack')

      await a.client.expectSilence('op_apply')
    })

    it('adds new factories and honours removedFactoryIds', async () => {
      const a = await joined(owner.token)

      a.client.send(op({ factories: [named(3, 'Foundries')], removedFactoryIds: [1] }, 0))
      await a.client.next('op_ack')

      const room = await readRoom()
      expect(room?.factories.map((factory: Factory) => factory.id)).toEqual([2, 3])
    })

    it('collapses a repeated id in one diff rather than storing it twice', async () => {
      const a = await joined(owner.token)

      a.client.send(op({ factories: [named(3, 'First'), named(3, 'Second')] }, 0))
      await a.client.next('op_ack')

      const room = await readRoom()
      expect(room?.factories.map((factory: Factory) => factory.id)).toEqual([1, 2, 3])
      // Last write wins, the same rule that settles a same-factory collision.
      expect(room?.factories[2].name).toBe('Second')
    })

    it('records an activity row and stamps lastActivityAt', async () => {
      const before = (await readRoom())?.lastActivityAt as Date
      const a = await joined(member.token)

      a.client.send(op({ powerTarget: 500 }, 0))
      await a.client.next('op_ack')

      const rows = await connection.collection('room_activity')
        .find({ roomId, kind: 'op' }).toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0].actor).toBe(member.userId)
      expect((await readRoom())?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    })
  })

  describe('the revision guard', () => {
    it('rejects a stale base and hands back a fresh snapshot', async () => {
      const a = await joined(owner.token)
      a.client.send(op({ name: 'First' }, 0))
      await a.client.next('op_ack')

      const stale = op({ name: 'Second' }, 0)
      a.client.send(stale)

      const rejected = await a.client.next('op_reject')
      expect(rejected).toMatchObject({ opId: stale.opId, reason: 'stale_base' })
      expect(rejected.snapshot?.revision).toBe(1)
      expect(rejected.snapshot?.name).toBe('First')
      expect((await readRoom())?.name).toBe('First')
    })

    it('serializes two clients racing at the same base: one ack, one reject', async () => {
      const a = await joined(owner.token)
      const b = await joined(member.token)

      a.client.send(op({ factories: [named(1, 'A wins')] }, 0))
      b.client.send(op({ factories: [named(2, 'B wins')] }, 0))

      const outcomes = [
        await a.client.nextOneOf(['op_ack', 'op_reject']),
        await b.client.nextOneOf(['op_ack', 'op_reject']),
      ]
      const acks = outcomes.filter(message => message.type === 'op_ack')
      const rejects = outcomes.filter(message => message.type === 'op_reject')

      expect(acks).toHaveLength(1)
      expect(rejects).toHaveLength(1)
      expect(acks[0]).toMatchObject({ revision: 1 })
      expect(rejects[0]).toMatchObject({ reason: 'stale_base' })
      expect(rejects[0].type === 'op_reject' && rejects[0].snapshot?.revision).toBe(1)
    })

    it('lands both edits when the loser rebases onto the snapshot', async () => {
      const a = await joined(owner.token)
      const b = await joined(member.token)

      a.client.send(op({ factories: [named(1, 'Ingot Smelters')] }, 0))
      await a.client.next('op_ack')

      // B was mid-edit at revision 0 and only ever touched factory 2.
      const intent = named(2, 'Rod Constructors')
      b.client.send(op({ factories: [intent] }, 0))
      const rejected = await b.client.next('op_reject')

      // The shared rebase path: adopt the server state, re-send the intent alone.
      b.client.send(op({ factories: [intent] }, rejected.snapshot?.revision as number))
      await expect(b.client.next('op_ack')).resolves.toMatchObject({ revision: 2 })

      const room = await readRoom()
      expect(room?.factories.map((factory: Factory) => factory.name))
        .toEqual(['Ingot Smelters', 'Rod Constructors'])
    })

    it('resolves a same-factory collision last-write-wins after the rebase', async () => {
      const a = await joined(owner.token)
      const b = await joined(member.token)

      a.client.send(op({ factories: [named(1, 'Named by A')] }, 0))
      await a.client.next('op_ack')

      const intent = named(1, 'Named by B')
      b.client.send(op({ factories: [intent] }, 0))
      const rejected = await b.client.next('op_reject')
      b.client.send(op({ factories: [intent] }, rejected.snapshot?.revision as number))
      await b.client.next('op_ack')

      const room = await readRoom()
      expect(room?.factories[0].name).toBe('Named by B')
    })
  })

  describe('the op id ring', () => {
    it('replays the original ack for a duplicate op id and changes nothing', async () => {
      const a = await joined(owner.token)

      const sent = op({ name: 'Once' }, 0)
      a.client.send(sent)
      await expect(a.client.next('op_ack')).resolves.toMatchObject({ revision: 1 })

      // The client's single in-flight retry: same op id, same stale base.
      a.client.send(sent)
      await expect(a.client.next('op_ack')).resolves.toMatchObject({
        opId: sent.opId,
        revision: 1,
      })

      const room = await readRoom()
      expect(room?.revision).toBe(1)
      expect(room?.appliedOps).toHaveLength(1)
    })

    it('does not re-broadcast a replayed op to peers', async () => {
      const a = await joined(owner.token)
      const b = await joined(member.token)

      const sent = op({ name: 'Once' }, 0)
      a.client.send(sent)
      await a.client.next('op_ack')
      await b.client.next('op_apply')

      a.client.send(sent)
      await a.client.next('op_ack')

      await b.client.expectSilence('op_apply')
    })

    it('keeps the ring bounded', async () => {
      const a = await joined(owner.token)

      for (let revision = 0; revision <= APPLIED_OPS_RING; revision++) {
        a.client.send(op({ powerTarget: revision }, revision))
        await a.client.next('op_ack')
      }

      const room = await readRoom()
      expect(room?.appliedOps).toHaveLength(APPLIED_OPS_RING)
      expect(room?.revision).toBe(APPLIED_OPS_RING + 1)
    }, 30_000)
  })

  describe('content-only rights', () => {
    it('refuses a member renaming the room, and leaves them in it to rebase', async () => {
      const b = await joined(member.token)

      const sent = op({ name: 'Renamed by a member', powerTarget: 900 }, 0)
      b.client.send(sent)

      const rejected = await b.client.next('op_reject')
      expect(rejected).toMatchObject({ roomId, opId: sent.opId, reason: 'forbidden' })
      expect(rejected.snapshot?.name).toBe('Iron Line')

      const room = await readRoom()
      expect(room?.name).toBe('Iron Line')
      expect(room?.revision).toBe(0)
      expect(room?.powerTarget).toBe(0)

      // Still joined: the same socket's content-only op goes straight through.
      b.client.send(op({ powerTarget: 900 }, 0))
      await expect(b.client.next('op_ack')).resolves.toMatchObject({ revision: 1 })
    })

    it('refuses an anonymous visitor renaming the room', async () => {
      const v = await joined()

      const sent = op({ name: 'Renamed by a visitor' }, 0)
      v.client.send(sent)

      await expect(v.client.next('op_reject')).resolves.toMatchObject({
        opId: sent.opId,
        reason: 'forbidden',
      })
      expect((await readRoom())?.name).toBe('Iron Line')
    })

    it('lets the owner rename through an op', async () => {
      const a = await joined(owner.token)

      a.client.send(op({ name: 'Renamed by the owner' }, 0))
      await a.client.next('op_ack')

      expect((await readRoom())?.name).toBe('Renamed by the owner')
    })
  })

  describe('refusals', () => {
    it('refuses an op that would push the room past the factory cap', async () => {
      const a = await joined(owner.token)

      // The room already holds two, so the cap has to be judged after the merge.
      const additions = Array.from(
        { length: CAPS.factoriesPerRoom - 1 },
        (_unused, index) => named(index + 3, `Extra ${index}`),
      )
      const sent = op({ factories: additions }, 0)
      a.client.send(sent)

      const rejected = await a.client.next('op_reject')
      expect(rejected).toMatchObject({ opId: sent.opId, reason: 'too_large' })
      expect(rejected.snapshot?.revision).toBe(0)

      const room = await readRoom()
      expect(room?.revision).toBe(0)
      expect(room?.factories).toHaveLength(2)
    }, 30_000)

    it('errors on an op for a room this socket never joined', async () => {
      const client = await greet(owner.token)

      client.send(op({ name: 'Sneaky' }, 0))

      await expect(client.next('error')).resolves.toMatchObject({ code: 'not_joined', roomId })
    })

    it('rejects a diff that fails the schema, with a snapshot to rebase onto', async () => {
      const a = await joined(owner.token)

      const opId = randomUUID()
      a.client.sendRaw({
        type: 'op',
        roomId,
        opId,
        baseRevision: 0,
        diff: { factories: [{ id: 'not-a-number' }] },
      })

      const rejected = await a.client.next('op_reject')
      expect(rejected).toMatchObject({ opId, reason: 'invalid' })
      expect(rejected.snapshot?.revision).toBe(0)
      expect((await readRoom())?.revision).toBe(0)
    })

    it('rejects an op on a room tombstoned under it', async () => {
      const a = await joined(owner.token)
      // Written straight to the collection: the REST delete would fan out and
      // close this socket, which is the revocation path rather than the op path.
      await connection.collection('rooms').updateOne({ roomId }, { $set: { deletedAt: new Date() } })

      const sent = op({ name: 'Too late' }, 0)
      a.client.send(sent)

      await expect(a.client.next('op_reject')).resolves.toMatchObject({
        opId: sent.opId,
        reason: 'room_deleted',
      })
      await expect(a.client.next('room_deleted')).resolves.toMatchObject({ roomId })
    })
  })
})
