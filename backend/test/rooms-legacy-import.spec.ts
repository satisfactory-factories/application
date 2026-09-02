import { randomUUID } from 'node:crypto'

import { CAPS } from 'common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Connection } from 'mongoose'

import { LEGACY_ROOM_NAME, legacyImportRoomId } from '../src/rooms/legacy-import.service'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'

const BLOB = [
  { id: 1, name: 'Old iron', products: [] },
  { id: 2, name: 'Old copper', products: [] },
]

describe('legacy blob import', () => {
  let context: TestContext
  let connection: Connection
  let user: TestUser

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)
  const get = (path: string, as?: TestUser) => call(context.app, 'get', path, as)

  const seedBlob = (username: string, data: unknown = BLOB) =>
    connection.collection('factorydatas').insertOne({
      user: username,
      data,
      lastSaved: new Date('2025-01-01T00:00:00.000Z'),
    })

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
    user = await registerAndLogin(context.app, 'veteran')
  })

  describe('POST /rooms/legacy/recover', () => {
    it('imports the blob as one room under a deterministic id', async () => {
      await seedBlob(user.username)

      const response = await post('/rooms/legacy/recover', user).send({})

      expect(response.status).toBe(200)
      expect(response.body.imported).toBe(true)
      expect(response.body.room).toMatchObject({
        roomId: legacyImportRoomId(user.userId),
        name: LEGACY_ROOM_NAME,
        role: 'owner',
        shared: false,
      })

      const stored = await connection.collection('rooms')
        .findOne({ roomId: response.body.room.roomId })
      expect((stored?.factories as { name: string }[]).map(factory => factory.name))
        .toEqual(['Old iron', 'Old copper'])
      expect((await get('/rooms', user)).body.rooms).toHaveLength(1)
    })

    it('is idempotent: the second call imports nothing', async () => {
      await seedBlob(user.username)
      await post('/rooms/legacy/recover', user).send({})

      const second = await post('/rooms/legacy/recover', user).send({})

      expect(second.status).toBe(200)
      expect(second.body).toEqual({ imported: false, reason: 'already_imported' })
      expect(await connection.collection('rooms').countDocuments()).toBe(1)
    })

    it('stays refused once stamped, even after the room is deleted', async () => {
      await seedBlob(user.username)
      const { body } = await post('/rooms/legacy/recover', user).send({})
      await call(context.app, 'delete', `/rooms/${body.room.roomId}`, user)

      expect((await post('/rooms/legacy/recover', user).send({})).body.reason)
        .toBe('already_imported')
    })

    it('reports no legacy data when the account never saved one', async () => {
      const response = await post('/rooms/legacy/recover', user).send({})

      expect(response.body).toEqual({ imported: false, reason: 'no_legacy_data' })
      expect(await connection.collection('rooms').countDocuments()).toBe(0)
    })

    it('never writes the FactoryData collection', async () => {
      await seedBlob(user.username)
      const before = await connection.collection('factorydatas').find({}).toArray()

      await post('/rooms/legacy/recover', user).send({})
      await post('/rooms/legacy/recover', user).send({})

      const after = await connection.collection('factorydatas').find({}).toArray()
      expect(after).toEqual(before)
    })

    it('truncates and caps the blob it imports', async () => {
      await seedBlob(user.username, [
        { id: 1, name: 'n'.repeat(400), notes: 'x'.repeat(2000) },
        ...Array.from({ length: CAPS.factoriesPerRoom + 20 }, (_unused, id) => ({ id: id + 2, name: 'f' })),
      ])

      const { body } = await post('/rooms/legacy/recover', user).send({})

      const stored = await connection.collection('rooms').findOne({ roomId: body.room.roomId })
      const factories = stored?.factories as { name: string, notes?: string }[]
      expect(factories).toHaveLength(CAPS.factoriesPerRoom)
      expect(factories[0].name).toHaveLength(CAPS.name)
      expect(factories[0].notes).toHaveLength(CAPS.notes)
    })

    // The client cannot work this out for itself: it never sees the blob.
    it('reports how many factories the cap left behind', async () => {
      await seedBlob(user.username, Array.from(
        { length: CAPS.factoriesPerRoom + 12 },
        (_unused, id) => ({ id: id + 1, name: 'f' }),
      ))

      const { body } = await post('/rooms/legacy/recover', user).send({})

      expect(body.imported).toBe(true)
      expect(body.dropped).toBe(12)
    })

    it('says nothing about drops for a blob that fitted', async () => {
      await seedBlob(user.username)

      const { body } = await post('/rooms/legacy/recover', user).send({})

      expect(body.imported).toBe(true)
      expect(body.dropped).toBeUndefined()
    })
  })

  describe('POST /rooms/legacy/auto-import', () => {
    it('imports for a zero-room account whose browser has no local tabs', async () => {
      await seedBlob(user.username)

      const response = await post('/rooms/legacy/auto-import', user).send({ localTabCount: 0 })

      expect(response.status).toBe(200)
      expect(response.body.imported).toBe(true)
    })

    it('declines when the browser reports local tabs', async () => {
      await seedBlob(user.username)

      const response = await post('/rooms/legacy/auto-import', user).send({ localTabCount: 3 })

      expect(response.body).toEqual({ imported: false, reason: 'not_eligible' })
      expect(await connection.collection('rooms').countDocuments()).toBe(0)
    })

    it('declines when the account already owns a room', async () => {
      await seedBlob(user.username)
      await post('/rooms', user).send({ roomId: randomUUID(), name: 'Already syncing' })

      const response = await post('/rooms/legacy/auto-import', user).send({ localTabCount: 0 })

      expect(response.body).toEqual({ imported: false, reason: 'not_eligible' })
      expect(await connection.collection('rooms').countDocuments()).toBe(1)
    })

    it('requires the local tab count', async () => {
      expect((await post('/rooms/legacy/auto-import', user).send({})).status).toBe(400)
    })
  })

  it('gives two accounts different import ids', () => {
    expect(legacyImportRoomId('a')).not.toBe(legacyImportRoomId('b'))
    expect(legacyImportRoomId('a')).toBe(legacyImportRoomId('a'))
    expect(legacyImportRoomId('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
