import { randomUUID } from 'node:crypto'

import { CAPS } from 'common'
import { makeFactory } from 'common/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Connection } from 'mongoose'

import { LEGACY_ROOM_NAME, legacyImportRoomId } from '../src/rooms/legacy-import.service'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { FailingStepRunner, TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'

const BLOB = [
  { id: 1, name: 'Old iron', products: [] },
  { id: 2, name: 'Old copper', products: [] },
]

// What a v0.6 client actually stored: the whole tab, sent verbatim to the old `/save`.
const wholeTab = (overrides: Record<string, unknown> = {}) => ({
  id: '2f3a0c74-6b21-4f0e-9a4d-1c8e5b7d0e11',
  name: 'Nuclear megabase',
  factories: [
    { id: 1, name: 'Old iron', products: [] },
    { id: 2, name: 'Old copper', products: [] },
  ],
  powerTarget: 4500,
  depotUploadTier: 2,
  depotExpansionTier: 3,
  groups: [{ id: 'group-1', name: 'Planned, no members yet', color: '#ff8800' }],
  plannerVersion: '0.6.2',
  ...overrides,
})

describe('legacy blob import', () => {
  let context: TestContext
  let connection: Connection
  let user: TestUser
  const runner = new FailingStepRunner()

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)
  const get = (path: string, as?: TestUser) => call(context.app, 'get', path, as)

  const seedBlob = (username: string, data: unknown = BLOB) =>
    connection.collection('factorydatas').insertOne({
      user: username,
      data,
      lastSaved: new Date('2025-01-01T00:00:00.000Z'),
    })

  beforeAll(async () => {
    context = await createTestApp({ stepRunner: runner, unthrottled: true })
    connection = await awaitConnection(context.app)
    await buildIndexes(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    runner.reset()
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

    it('leaves a bare-array save on the room defaults', async () => {
      await seedBlob(user.username)

      const { body } = await post('/rooms/legacy/recover', user).send({})

      const stored = await connection.collection('rooms').findOne({ roomId: body.room.roomId })
      expect(stored).toMatchObject({ name: LEGACY_ROOM_NAME, powerTarget: 0, groups: [] })
      expect(stored?.depotUploadTier).toBeUndefined()
      expect(stored?.depotExpansionTier).toBeUndefined()
      expect(stored?.plannerVersion).toBeUndefined()
    })
  })

  // The shape the great majority of accounts were last saved in. Recovering only the
  // factories out of it would hand the plan back with its plan-level state stripped.
  describe('POST /rooms/legacy/recover, whole-tab save', () => {
    it('imports the factories out of the tab object', async () => {
      await seedBlob(user.username, wholeTab())

      const response = await post('/rooms/legacy/recover', user).send({})

      expect(response.status).toBe(200)
      expect(response.body.imported).toBe(true)
      const stored = await connection.collection('rooms')
        .findOne({ roomId: response.body.room.roomId })
      expect((stored?.factories as { name: string }[]).map(factory => factory.name))
        .toEqual(['Old iron', 'Old copper'])
    })

    it('keeps the tab-level state the v0.6 shape exists to carry', async () => {
      await seedBlob(user.username, wholeTab())

      const { body } = await post('/rooms/legacy/recover', user).send({})

      const stored = await connection.collection('rooms').findOne({ roomId: body.room.roomId })
      expect(stored).toMatchObject({
        name: 'Nuclear megabase',
        powerTarget: 4500,
        depotUploadTier: 2,
        depotExpansionTier: 3,
        plannerVersion: '0.6.2',
        groups: [{ id: 'group-1', name: 'Planned, no members yet', color: '#ff8800' }],
      })
      expect(body.room.name).toBe('Nuclear megabase')
    })

    // Absent is a meaning: the tiers read as fully researched and the version as unanswered.
    it('leaves the fields the tab never set absent', async () => {
      await seedBlob(user.username, {
        id: 'tab-1',
        name: 'Early plan',
        factories: [{ id: 1, name: 'Old iron' }],
      })

      const { body } = await post('/rooms/legacy/recover', user).send({})

      const stored = await connection.collection('rooms').findOne({ roomId: body.room.roomId })
      expect(stored?.name).toBe('Early plan')
      expect(stored?.powerTarget).toBe(0)
      expect(stored?.groups).toEqual([])
      expect(stored?.depotUploadTier).toBeUndefined()
      expect(stored?.plannerVersion).toBeUndefined()
    })

    it('falls back to the import name when the tab has none worth using', async () => {
      await seedBlob(user.username, wholeTab({ name: '   ' }))

      const { body } = await post('/rooms/legacy/recover', user).send({})

      expect(body.room.name).toBe(LEGACY_ROOM_NAME)
    })

    it('truncates and caps the tab it imports', async () => {
      await seedBlob(user.username, wholeTab({
        name: 't'.repeat(400),
        groups: [{ id: 'group-1', name: 'g'.repeat(400) }],
        factories: [
          { id: 1, name: 'n'.repeat(400), notes: 'x'.repeat(2000) },
          ...Array.from({ length: CAPS.factoriesPerRoom + 20 }, (_unused, id) => ({ id: id + 2, name: 'f' })),
        ],
      }))

      const { body } = await post('/rooms/legacy/recover', user).send({})

      const stored = await connection.collection('rooms').findOne({ roomId: body.room.roomId })
      const factories = stored?.factories as { name: string, notes?: string }[]
      expect(factories).toHaveLength(CAPS.factoriesPerRoom)
      expect(factories[0].name).toHaveLength(CAPS.name)
      expect(factories[0].notes).toHaveLength(CAPS.notes)
      expect(stored?.name).toHaveLength(CAPS.name)
      expect((stored?.groups as { name: string }[])[0].name).toHaveLength(CAPS.name)
    })

    it('reports how many factories the cap left behind', async () => {
      await seedBlob(user.username, wholeTab({
        factories: Array.from(
          { length: CAPS.factoriesPerRoom + 12 },
          (_unused, id) => ({ id: id + 1, name: 'f' }),
        ),
      }))

      const { body } = await post('/rooms/legacy/recover', user).send({})

      expect(body.imported).toBe(true)
      expect(body.dropped).toBe(12)
    })

    it.each([
      ['no factories key', { id: 'tab-1', name: 'Empty' }],
      ['an empty factory list', wholeTab({ factories: [] })],
      ['a factories key that is not a list', wholeTab({ factories: 'nope' })],
      ['nothing usable in the list', wholeTab({ factories: ['junk', 7, null] })],
      ['a string', 'not a plan'],
      ['a number', 7],
      ['null', null],
    ])('reports no legacy data for a blob holding %s', async (_label, data) => {
      await seedBlob(user.username, data)

      const response = await post('/rooms/legacy/recover', user).send({})

      expect(response.body).toEqual({ imported: false, reason: 'no_legacy_data' })
      expect(await connection.collection('rooms').countDocuments()).toBe(0)
    })
  })

  describe('GET /rooms/legacy/status', () => {
    it('reports the old save and how big it is', async () => {
      await seedBlob(user.username)

      const response = await get('/rooms/legacy/status', user)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ exists: true, factoryCount: 2 })
    })

    it('reports nothing for an account that never saved one', async () => {
      expect((await get('/rooms/legacy/status', user)).body)
        .toEqual({ exists: false, factoryCount: 0 })
    })

    // The offer would otherwise be made for an import that can only be refused.
    it('reports nothing once the blob has been imported', async () => {
      await seedBlob(user.username)
      await post('/rooms/legacy/recover', user).send({})

      expect((await get('/rooms/legacy/status', user)).body)
        .toEqual({ exists: false, factoryCount: 0 })
    })

    it('counts the whole save, above the per-room cap', async () => {
      await seedBlob(user.username, Array.from(
        { length: CAPS.factoriesPerRoom + 7 },
        (_unused, id) => ({ id: id + 1, name: 'f' }),
      ))

      expect((await get('/rooms/legacy/status', user)).body.factoryCount)
        .toBe(CAPS.factoriesPerRoom + 7)
    })

    it('counts only what the import would keep', async () => {
      await seedBlob(user.username, [{ id: 1, name: 'Real' }, 'junk', 7, null])

      expect((await get('/rooms/legacy/status', user)).body)
        .toEqual({ exists: true, factoryCount: 1 })
    })

    it('survives a blob whose data is not a list at all', async () => {
      await seedBlob(user.username, { factories: [] })

      expect((await get('/rooms/legacy/status', user)).body)
        .toEqual({ exists: false, factoryCount: 0 })
    })

    // Without this the most common save shape offers nothing to recover.
    it('reports a whole-tab save', async () => {
      await seedBlob(user.username, wholeTab())

      expect((await get('/rooms/legacy/status', user)).body)
        .toEqual({ exists: true, factoryCount: 2 })
    })

    it('counts a whole-tab save above the per-room cap', async () => {
      await seedBlob(user.username, wholeTab({
        factories: Array.from(
          { length: CAPS.factoriesPerRoom + 7 },
          (_unused, id) => ({ id: id + 1, name: 'f' }),
        ),
      }))

      expect((await get('/rooms/legacy/status', user)).body.factoryCount)
        .toBe(CAPS.factoriesPerRoom + 7)
    })

    it('counts only what a whole-tab import would keep', async () => {
      await seedBlob(user.username, wholeTab({ factories: [{ id: 1, name: 'Real' }, 'junk', 7, null] }))

      expect((await get('/rooms/legacy/status', user)).body)
        .toEqual({ exists: true, factoryCount: 1 })
    })

    it.each([
      ['a factories key that is not a list', wholeTab({ factories: 'nope' })],
      ['a string', 'not a plan'],
      ['a number', 7],
      ['null', null],
    ])('reports nothing for a blob holding %s', async (_label, data) => {
      await seedBlob(user.username, data)

      expect((await get('/rooms/legacy/status', user)).body)
        .toEqual({ exists: false, factoryCount: 0 })
    })

    it('needs an account', async () => {
      expect((await get('/rooms/legacy/status')).status).toBe(401)
    })
  })

  /**
   * The boot path: a signed-in client calls this once per session and the plan is
   * upgraded without anyone pressing anything. Nothing about the browser gates it,
   * so the same account gets the same answer wherever it signs in.
   */
  describe('POST /rooms/legacy/auto-import', () => {
    const autoImport = (as: TestUser = user) => post('/rooms/legacy/auto-import', as).send({})

    it('upgrades a v0.5 array save without being asked', async () => {
      await seedBlob(user.username)

      const response = await autoImport()

      expect(response.status).toBe(200)
      expect(response.body.imported).toBe(true)
      expect(response.body.room).toMatchObject({
        roomId: legacyImportRoomId(user.userId),
        name: LEGACY_ROOM_NAME,
        role: 'owner',
      })
      const stored = await connection.collection('rooms')
        .findOne({ roomId: response.body.room.roomId })
      expect((stored?.factories as { name: string }[]).map(factory => factory.name))
        .toEqual(['Old iron', 'Old copper'])
    })

    it('upgrades a v0.6 whole-tab save and keeps its tab-level state', async () => {
      await seedBlob(user.username, wholeTab())

      const { body } = await autoImport()

      expect(body.imported).toBe(true)
      expect(body.room.name).toBe('Nuclear megabase')
      const stored = await connection.collection('rooms').findOne({ roomId: body.room.roomId })
      expect(stored).toMatchObject({
        name: 'Nuclear megabase',
        powerTarget: 4500,
        depotUploadTier: 2,
        depotExpansionTier: 3,
        plannerVersion: '0.6.2',
        groups: [{ id: 'group-1', name: 'Planned, no members yet', color: '#ff8800' }],
      })
    })

    it('runs once for all time: the next sign-in upgrades nothing', async () => {
      await seedBlob(user.username)
      await autoImport()

      const second = await autoImport()

      expect(second.body).toEqual({ imported: false, reason: 'already_imported' })
      expect(await connection.collection('rooms').countDocuments()).toBe(1)
      expect(await connection.collection('room_memberships').countDocuments()).toBe(1)
    })

    // Two tabs signing in together. Driven as a real race: awaiting the first would
    // prove only that the short circuit works, which is not the case that breaks.
    it('two concurrent sign-ins produce exactly one room and one import', async () => {
      await seedBlob(user.username)

      const results = await Promise.all([autoImport(), autoImport()])

      expect(results.map(result => result.status)).toEqual([200, 200])
      expect(results.filter(result => result.body.imported)).toHaveLength(1)
      expect(results.filter(result => result.body.reason === 'already_imported')).toHaveLength(1)
      expect(await connection.collection('rooms').countDocuments()).toBe(1)
      expect(await connection.collection('room_memberships').countDocuments()).toBe(1)
    })

    // The upgrade adds a room and only ever adds one; an account already on v0.7
    // keeps every plan it has, with its content and its order untouched.
    it('adds a room to an account that already has v7 rooms, changing none of them', async () => {
      await seedBlob(user.username)
      const existing = randomUUID()
      await post('/rooms', user).send({
        roomId: existing,
        name: 'Already syncing',
        factories: [makeFactory({ id: 9, name: 'Steel' })],
      })
      const before = await connection.collection('rooms').findOne({ roomId: existing })

      const { body } = await autoImport()

      expect(body.imported).toBe(true)
      expect(await connection.collection('rooms').findOne({ roomId: existing })).toEqual(before)

      const rooms = (await get('/rooms', user)).body.rooms as { roomId: string, order: number }[]
      expect(rooms).toHaveLength(2)
      expect(rooms.find(room => room.roomId === existing)?.order).toBe(0)
      expect(rooms.find(room => room.roomId === body.room.roomId)?.order).toBe(1)
    })

    it.each(['ensure-room', 'ensure-membership', 'stamp-legacy-import'])(
      'leaves the save intact and retryable when the upgrade dies at %s',
      async step => {
        await seedBlob(user.username, wholeTab())
        const blobBefore = await connection.collection('factorydatas').find({}).toArray()
        runner.failAt = step as never

        expect((await autoImport()).status).toBe(500)

        expect(await connection.collection('factorydatas').find({}).toArray()).toEqual(blobBefore)
        expect((await connection.collection('users').findOne({ username: user.username }))
          ?.legacyImportRoomId).toBeNull()
        // The old save is still on offer, so nothing about the account looks done.
        expect((await get('/rooms/legacy/status', user)).body)
          .toEqual({ exists: true, factoryCount: 2 })

        runner.reset()
        const retry = await autoImport()

        expect(retry.body.imported).toBe(true)
        expect(await connection.collection('rooms').countDocuments()).toBe(1)
      },
    )

    // The button is the fallback for whoever the boot path missed, so the two must
    // never both be live: once the upgrade has run there is nothing left to offer.
    it('takes the manual offer off the table once it has run', async () => {
      await seedBlob(user.username)

      await autoImport()

      expect((await get('/rooms/legacy/status', user)).body)
        .toEqual({ exists: false, factoryCount: 0 })
      expect((await post('/rooms/legacy/recover', user).send({})).body)
        .toEqual({ imported: false, reason: 'already_imported' })
    })

    it('leaves the manual offer standing when the upgrade found nothing', async () => {
      const response = await autoImport()

      expect(response.body).toEqual({ imported: false, reason: 'no_legacy_data' })
      await seedBlob(user.username)
      expect((await get('/rooms/legacy/status', user)).body)
        .toEqual({ exists: true, factoryCount: 2 })
    })

    it('needs an account', async () => {
      expect((await post('/rooms/legacy/auto-import').send({})).status).toBe(401)
    })
  })

  it('gives two accounts different import ids', () => {
    expect(legacyImportRoomId('a')).not.toBe(legacyImportRoomId('b'))
    expect(legacyImportRoomId('a')).toBe(legacyImportRoomId('a'))
    expect(legacyImportRoomId('a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
