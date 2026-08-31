import { randomUUID } from 'node:crypto'

import { CAPS } from 'common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Connection } from 'mongoose'
import { makeFactory } from 'common/testing'

import { RoomEventsService } from '../src/rooms/room-events.service'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'

describe('rooms', () => {
  let context: TestContext
  let connection: Connection
  let owner: TestUser
  let other: TestUser

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)
  const put = (path: string, as?: TestUser) => call(context.app, 'put', path, as)
  const get = (path: string, as?: TestUser) => call(context.app, 'get', path, as)
  const del = (path: string, as?: TestUser) => call(context.app, 'delete', path, as)

  const createRoom = async (as: TestUser, name = 'Iron Line', roomId = randomUUID()) => {
    const response = await post('/rooms', as).send({ roomId, name })
    expect(response.status).toBe(201)
    return response.body.room
  }

  beforeAll(async () => {
    context = await createTestApp({ unthrottled: true })
    connection = await awaitConnection(context.app)
    await buildIndexes(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    await resetRooms(context.app)
    owner = await registerAndLogin(context.app, 'owner')
    other = await registerAndLogin(context.app, 'other')
  })

  describe('authentication and the version gate', () => {
    it('401s every authenticated route without a bearer token', async () => {
      expect((await get('/rooms')).status).toBe(401)
      expect((await post('/rooms').send({ name: 'x' })).status).toBe(401)
      expect((await del(`/rooms/${randomUUID()}`)).status).toBe(401)
    })

    it('426s without the app version header', async () => {
      const response = await call(context.app, 'get', '/rooms')
        .set('X-App-Version', '')
        .set('Authorization', `Bearer ${owner.token}`)

      expect(response.status).toBe(426)
    })
  })

  describe('POST /rooms', () => {
    it('creates the room, the owner membership and bumps roomsRevision', async () => {
      const roomId = randomUUID()
      const response = await post('/rooms', owner).send({ roomId, name: 'Iron Line' })

      expect(response.status).toBe(201)
      expect(response.body.status).toBe('created')
      expect(response.body.room).toMatchObject({
        roomId,
        name: 'Iron Line',
        slug: null,
        shared: false,
        hasPassword: false,
        revision: 0,
        role: 'owner',
        order: 0,
      })

      const stored = await connection.collection('rooms').findOne({ roomId })
      expect(stored).toMatchObject({ createdBy: owner.userId, deletedAt: null, factories: [] })

      const membership = await connection.collection('room_memberships').findOne({ roomId })
      expect(membership).toMatchObject({ userId: owner.userId, role: 'owner', order: 0 })

      const user = await connection.collection('users').findOne({ username: owner.username })
      expect(user?.roomsRevision).toBe(1)
    })

    it('generates a room id when the client does not supply one', async () => {
      const response = await post('/rooms', owner).send({ name: 'Unnamed' })

      expect(response.status).toBe(201)
      expect(response.body.room.roomId).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('stores seeded content verbatim, empty maps included', async () => {
      const roomId = randomUUID()
      const factory = makeFactory({ name: 'Copper', syncState: {}, rawResources: {} })

      await post('/rooms', owner).send({ roomId, name: 'Seeded', factories: [factory], powerTarget: 500 })

      const stored = await connection.collection('rooms').findOne({ roomId })
      expect(stored?.powerTarget).toBe(500)
      expect((stored?.factories as unknown[])[0]).toMatchObject({ name: 'Copper' })
      expect((stored?.factories as { syncState: unknown }[])[0].syncState).toEqual({})
    })

    it('records a created activity row', async () => {
      const room = await createRoom(owner)
      const rows = await connection.collection('room_activity').find({ roomId: room.roomId }).toArray()

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ kind: 'created', actor: owner.userId })
      expect(rows[0].at).toBeInstanceOf(Date)
    })

    it('emits rooms_changed for the creator', async () => {
      const seen: string[][] = []
      context.app.get(RoomEventsService).on('rooms_changed', ({ userIds }) => seen.push(userIds))

      await createRoom(owner)

      expect(seen).toContainEqual([owner.userId])
    })
  })

  describe('GET /rooms', () => {
    it('returns rooms in membership order with the account roomsRevision', async () => {
      const first = await createRoom(owner, 'First')
      const second = await createRoom(owner, 'Second')

      const response = await get('/rooms', owner)

      expect(response.status).toBe(200)
      expect(response.body.roomsRevision).toBe(2)
      expect(response.body.rooms.map((room: { name: string }) => room.name)).toEqual(['First', 'Second'])
      expect(response.body.rooms[0].roomId).toBe(first.roomId)
      expect(response.body.rooms[1].order).toBe(1)
      expect(second.order).toBe(1)
    })

    it('carries a last-changed stamp the tab list can show', async () => {
      const room = await createRoom(owner, 'Timed')

      const [listed] = (await get('/rooms', owner)).body.rooms
      expect(listed.lastActivityAt).toEqual(expect.any(String))
      expect(new Date(listed.lastActivityAt).toISOString()).toBe(listed.lastActivityAt)

      await put(`/rooms/${room.roomId}/name`, owner).send({ name: 'Renamed' })

      const stored = await connection.collection('rooms').findOne({ roomId: room.roomId })
      const [renamed] = (await get('/rooms', owner)).body.rooms
      expect(renamed.lastActivityAt).toBe((stored?.lastActivityAt as Date).toISOString())
      expect(new Date(renamed.lastActivityAt).getTime())
        .toBeGreaterThanOrEqual(new Date(listed.lastActivityAt).getTime())
    })

    it('carries a factory count without shipping the factories themselves', async () => {
      const roomId = randomUUID()
      await post('/rooms', owner).send({
        roomId,
        name: 'Counted',
        factories: [makeFactory({ id: 1, name: 'A' }), makeFactory({ id: 2, name: 'B' })],
      })
      await createRoom(owner, 'Empty')

      const rooms = (await get('/rooms', owner)).body.rooms as
        { roomId: string, factoryCount: number, factories?: unknown }[]

      const counted = rooms.find(room => room.roomId === roomId)
      expect(counted?.factoryCount).toBe(2)
      expect(counted?.factories).toBeUndefined()
      expect(rooms.find(room => room.roomId !== roomId)?.factoryCount).toBe(0)
    })

    it('hides another account\'s rooms', async () => {
      await createRoom(owner)

      expect((await get('/rooms', other)).body.rooms).toEqual([])
    })

    it('hides a tombstoned room even while its membership row survives', async () => {
      const room = await createRoom(owner)
      await connection.collection('rooms').updateOne(
        { roomId: room.roomId },
        { $set: { deletedAt: new Date() } },
      )

      expect((await get('/rooms', owner)).body.rooms).toEqual([])
    })
  })

  describe('PUT /rooms/:roomId/name', () => {
    it('renames for the owner and fans out to every member', async () => {
      const room = await createRoom(owner)
      await post(`/rooms/${room.roomId}/share`, owner).send({})
      await post(`/rooms/${room.roomId}/join`, other).send({})

      const before = (await get('/rooms', other)).body.roomsRevision
      const response = await put(`/rooms/${room.roomId}/name`, owner).send({ name: 'Renamed' })

      expect(response.status).toBe(200)
      expect(response.body.room.name).toBe('Renamed')
      expect((await get('/rooms', other)).body.roomsRevision).toBe(before + 1)
      expect((await get('/rooms', other)).body.rooms[0].name).toBe('Renamed')
    })

    it('truncates an over-long name to the cap rather than rejecting it', async () => {
      const room = await createRoom(owner)

      const response = await put(`/rooms/${room.roomId}/name`, owner).send({ name: 'a'.repeat(500) })

      expect(response.status).toBe(200)
      expect(response.body.room.name).toHaveLength(CAPS.name)
    })

    it('refuses a member\'s rename', async () => {
      const room = await createRoom(owner)
      await post(`/rooms/${room.roomId}/share`, owner).send({})
      await post(`/rooms/${room.roomId}/join`, other).send({})

      const response = await put(`/rooms/${room.roomId}/name`, other).send({ name: 'Hijacked' })

      expect(response.status).toBe(403)
      expect(response.body.code).toBe('forbidden')

      const stored = await connection.collection('rooms').findOne({ roomId: room.roomId })
      expect(stored?.name).toBe('Iron Line')
    })

    it('404s a stranger, revealing nothing about the room', async () => {
      const room = await createRoom(owner)

      const response = await put(`/rooms/${room.roomId}/name`, other).send({ name: 'Nope' })

      expect(response.status).toBe(403)
      expect((await put(`/rooms/${randomUUID()}/name`, other).send({ name: 'Nope' })).status).toBe(404)
    })
  })

  describe('the role matrix', () => {
    let roomId: string

    beforeEach(async () => {
      const room = await createRoom(owner)
      roomId = room.roomId
      await post(`/rooms/${roomId}/share`, owner).send({})
      await post(`/rooms/${roomId}/join`, other).send({})
    })

    it('refuses every owner-only route to a member', async () => {
      expect((await put(`/rooms/${roomId}/name`, other).send({ name: 'x' })).status).toBe(403)
      expect((await post(`/rooms/${roomId}/share`, other).send({})).status).toBe(403)
      expect((await post(`/rooms/${roomId}/unshare`, other).send({})).status).toBe(403)
      expect((await put(`/rooms/${roomId}/password`, other).send({ password: 'x' })).status).toBe(403)
      expect((await del(`/rooms/${roomId}/password`, other)).status).toBe(403)
      expect((await del(`/rooms/${roomId}`, other)).status).toBe(403)
    })

    it('lets a member leave, and refuses the owner the same', async () => {
      expect((await post(`/rooms/${roomId}/leave`, other).send({})).status).toBe(200)
      expect((await get('/rooms', other)).body.rooms).toEqual([])

      const response = await post(`/rooms/${roomId}/leave`, owner).send({})
      expect(response.status).toBe(400)
      expect(response.body.code).toBe('owner_cannot_leave')
    })

    it('refuses leave to someone who was never a member', async () => {
      const stranger = await registerAndLogin(context.app, 'stranger')

      expect((await post(`/rooms/${roomId}/leave`, stranger).send({})).status).toBe(403)
    })
  })

  describe('PUT /rooms/order', () => {
    it('reorders only the caller\'s memberships and bumps their revision', async () => {
      const first = await createRoom(owner, 'First')
      const second = await createRoom(owner, 'Second')
      const before = (await get('/rooms', owner)).body.roomsRevision

      const response = await put('/rooms/order', owner).send({ roomIds: [second.roomId, first.roomId] })

      expect(response.status).toBe(200)
      expect(response.body.rooms.map((room: { name: string }) => room.name)).toEqual(['Second', 'First'])
      expect(response.body.roomsRevision).toBe(before + 1)
    })

    it('404s an id the caller has no membership for', async () => {
      const mine = await createRoom(owner)
      const theirs = await createRoom(other)

      const response = await put('/rooms/order', owner).send({ roomIds: [mine.roomId, theirs.roomId] })

      expect(response.status).toBe(404)
    })
  })

  describe('share and unshare', () => {
    it('allocates a three-word slug and resolves it', async () => {
      const room = await createRoom(owner)

      const response = await post(`/rooms/${room.roomId}/share`, owner).send({})

      expect(response.status).toBe(200)
      expect(response.body.room.shared).toBe(true)
      expect(response.body.room.slug).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/)

      const lookup = await get(`/rooms/by-slug/${response.body.room.slug}`)
      expect(lookup.status).toBe(200)
      expect(lookup.body).toEqual({ roomId: room.roomId, name: 'Iron Line', hasPassword: false })
    })

    it('accepts a custom slug and refuses one already taken', async () => {
      const mine = await createRoom(owner)
      const theirs = await createRoom(other)

      expect((await post(`/rooms/${mine.roomId}/share`, owner).send({ slug: 'Iron-Works' })).body.room.slug)
        .toBe('iron-works')

      const clash = await post(`/rooms/${theirs.roomId}/share`, other).send({ slug: 'iron-works' })
      expect(clash.status).toBe(409)
      expect(clash.body.code).toBe('slug_taken')
    })

    it('rejects a slug outside the pattern', async () => {
      const room = await createRoom(owner)

      const response = await post(`/rooms/${room.roomId}/share`, owner).send({ slug: 'not a slug!' })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('invalid_payload')
    })

    it('404s a slug lookup for an unshared or tombstoned room', async () => {
      const room = await createRoom(owner)
      const { body } = await post(`/rooms/${room.roomId}/share`, owner).send({})
      await post(`/rooms/${room.roomId}/unshare`, owner).send({})

      expect((await get(`/rooms/by-slug/${body.room.slug}`)).status).toBe(404)
    })

    it('unshare drops every non-owner membership, keeps the owner and bumps them all', async () => {
      const room = await createRoom(owner)
      await post(`/rooms/${room.roomId}/share`, owner).send({})
      await post(`/rooms/${room.roomId}/join`, other).send({})
      const before = (await get('/rooms', other)).body.roomsRevision

      const events: Record<string, unknown>[] = []
      const bus = context.app.get(RoomEventsService)
      bus.on('access_revoked', payload => events.push(payload))

      const response = await post(`/rooms/${room.roomId}/unshare`, owner).send({})

      expect(response.status).toBe(200)
      expect(response.body.room.shared).toBe(false)
      expect(events).toContainEqual({ roomId: room.roomId, scope: 'non-owners' })
      expect((await get('/rooms', other)).body.rooms).toEqual([])
      expect((await get('/rooms', other)).body.roomsRevision).toBe(before + 1)
      expect((await get('/rooms', owner)).body.rooms).toHaveLength(1)
    })
  })

  describe('DELETE /rooms/:roomId', () => {
    it('tombstones, clears memberships and makes the room inert', async () => {
      const room = await createRoom(owner)
      await post(`/rooms/${room.roomId}/share`, owner).send({})
      await post(`/rooms/${room.roomId}/join`, other).send({})

      const deleted: string[] = []
      context.app.get(RoomEventsService).on('room_deleted', ({ roomId }) => deleted.push(roomId))

      const response = await del(`/rooms/${room.roomId}`, owner)

      expect(response.status).toBe(200)
      expect(deleted).toContain(room.roomId)

      const stored = await connection.collection('rooms').findOne({ roomId: room.roomId })
      expect(stored?.deletedAt).toBeInstanceOf(Date)
      expect(stored?.shared).toBe(false)
      expect(stored?.slug).toBeNull()

      expect(await connection.collection('room_memberships').countDocuments({ roomId: room.roomId })).toBe(0)
      expect((await get('/rooms', owner)).body.rooms).toEqual([])
      expect((await post(`/rooms/${room.roomId}/join`, other).send({})).status).toBe(404)
      expect((await put(`/rooms/${room.roomId}/name`, owner).send({ name: 'x' })).status).toBe(404)
    })

    it('leaves the document for the sweeper rather than deleting it inline', async () => {
      const room = await createRoom(owner)
      await del(`/rooms/${room.roomId}`, owner)

      expect(await connection.collection('rooms').countDocuments({ roomId: room.roomId })).toBe(1)
    })

    it('404s an unknown room', async () => {
      expect((await del(`/rooms/${randomUUID()}`, owner)).status).toBe(404)
    })
  })

  describe('caps', () => {
    it('rejects an eleventh owned room', async () => {
      for (let index = 0; index < CAPS.ownedRoomsPerUser; index++) {
        await createRoom(owner, `Room ${index}`)
      }

      const response = await post('/rooms', owner).send({ roomId: randomUUID(), name: 'One too many' })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('too_many_rooms')
    })

    it('counts a deleted room against nothing', async () => {
      const rooms = []
      for (let index = 0; index < CAPS.ownedRoomsPerUser; index++) {
        rooms.push(await createRoom(owner, `Room ${index}`))
      }
      await del(`/rooms/${rooms[0].roomId}`, owner)

      expect((await post('/rooms', owner).send({ roomId: randomUUID(), name: 'Replacement' })).status)
        .toBe(201)
    })

    it('rejects more than 300 factories in one room', async () => {
      const factories = Array.from({ length: CAPS.factoriesPerRoom + 1 }, (_unused, id) =>
        makeFactory({ id }))

      const response = await post('/rooms', owner).send({ roomId: randomUUID(), name: 'Huge', factories })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('invalid_payload')
      expect(await connection.collection('rooms').countDocuments()).toBe(0)
    })

    it('rejects a non-finite number inside a factory', async () => {
      const factory = makeFactory()
      const response = await post('/rooms', owner)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({
          roomId: randomUUID(),
          name: 'Broken',
          factories: [{ ...factory, displayOrder: 'NaN' }],
        }))

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('invalid_payload')
    })

    it('truncates factory names, notes and tasks instead of rejecting them', async () => {
      const roomId = randomUUID()
      const factory = makeFactory({
        name: 'n'.repeat(400),
        notes: 'x'.repeat(2000),
        tasks: Array.from({ length: CAPS.tasks + 10 }, () => ({ title: 't'.repeat(400), completed: false })),
      })

      const response = await post('/rooms', owner).send({ roomId, name: 'Fine', factories: [factory] })

      expect(response.status).toBe(201)
      const stored = await connection.collection('rooms').findOne({ roomId })
      const saved = (stored?.factories as { name: string, notes: string, tasks: { title: string }[] }[])[0]
      expect(saved.name).toHaveLength(CAPS.name)
      expect(saved.notes).toHaveLength(CAPS.notes)
      expect(saved.tasks).toHaveLength(CAPS.tasks)
      expect(saved.tasks[0].title).toHaveLength(CAPS.taskTitle)
    })

    it('rejects the twenty-sixth membership', async () => {
      const joiner = await registerAndLogin(context.app, 'joiner')
      // Ten of the joiner's own rooms, then fifteen shared ones to reach the cap.
      for (let index = 0; index < CAPS.ownedRoomsPerUser; index++) {
        await createRoom(joiner, `Own ${index}`)
      }
      const hosts = [owner, other, await registerAndLogin(context.app, 'third')]
      const shared: string[] = []
      for (let index = 0; index < CAPS.membershipsPerUser - CAPS.ownedRoomsPerUser + 1; index++) {
        const host = hosts[index % hosts.length]
        const room = await createRoom(host, `Shared ${index}`)
        await post(`/rooms/${room.roomId}/share`, host).send({})
        shared.push(room.roomId)
      }

      for (const roomId of shared.slice(0, -1)) {
        expect((await post(`/rooms/${roomId}/join`, joiner).send({})).status).toBe(200)
      }

      const response = await post(`/rooms/${shared[shared.length - 1]}/join`, joiner).send({})
      expect(response.status).toBe(400)
      expect(response.body.code).toBe('too_many_memberships')
    })
  })
})
