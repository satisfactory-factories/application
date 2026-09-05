import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Connection } from 'mongoose'
import { makeFactory } from 'common/testing'

import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'

describe('POST /rooms/adopt', () => {
  let context: TestContext
  let connection: Connection
  let mine: TestUser
  let theirs: TestUser

  const adopt = (as: TestUser, body: Record<string, unknown>) =>
    call(context.app, 'post', '/rooms/adopt', as).send(body)

  const localTab = (roomId: string) => ({
    roomId,
    name: 'Local plan',
    factories: [makeFactory({ name: 'Adopted' })],
    powerTarget: 250,
    depotUploadTier: 1,
    depotExpansionTier: 3,
    plannerVersion: '0.6.0',
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
    mine = await registerAndLogin(context.app, 'mine')
    theirs = await registerAndLogin(context.app, 'theirs')
  })

  it('adopts a local tab under its own id, keeping the content', async () => {
    const roomId = randomUUID()

    const response = await adopt(mine, localTab(roomId))

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('created')
    expect(response.body.room).toMatchObject({ roomId, name: 'Local plan', role: 'owner' })

    const stored = await connection.collection('rooms').findOne({ roomId })
    expect(stored?.powerTarget).toBe(250)
    expect((stored?.factories as { name: string }[])[0].name).toBe('Adopted')

    const rows = await connection.collection('room_activity').find({ roomId }).toArray()
    expect(rows.map(row => row.kind)).toEqual(['adopted'])
  })

  describe('duplicate roomId disambiguation', () => {
    it('mine-with-membership: reports the adoption already done and never overwrites', async () => {
      const roomId = randomUUID()
      await adopt(mine, localTab(roomId))

      const response = await adopt(mine, { ...localTab(roomId), name: 'Renamed locally', powerTarget: 999 })

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('already_exists')
      expect(response.body.room.name).toBe('Local plan')

      const stored = await connection.collection('rooms').findOne({ roomId })
      expect(stored?.powerTarget).toBe(250)
      expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(1)
    })

    it('mine-without-membership: resumes by creating the missing membership', async () => {
      const roomId = randomUUID()
      await adopt(mine, localTab(roomId))
      await connection.collection('room_memberships').deleteMany({ roomId })

      const response = await adopt(mine, localTab(roomId))

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('resumed')
      expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(1)
    })

    it('someone else\'s: 409s and tells the client to re-key', async () => {
      const roomId = randomUUID()
      await adopt(theirs, localTab(roomId))

      const response = await adopt(mine, localTab(roomId))

      expect(response.status).toBe(409)
      expect(response.body.code).toBe('room_id_taken')
      expect(response.body.message).toMatch(/re-key/i)

      const stored = await connection.collection('rooms').findOne({ roomId })
      expect(stored?.createdBy).toBe(theirs.userId)
    })

    it('mine but tombstoned: 409s rather than resurrecting a deleted room', async () => {
      const roomId = randomUUID()
      await adopt(mine, localTab(roomId))
      await call(context.app, 'delete', `/rooms/${roomId}`, mine)

      const response = await adopt(mine, localTab(roomId))

      expect(response.status).toBe(409)
      expect(response.body.code).toBe('room_id_taken')
    })
  })

  it('survives a double submit with one room and one membership', async () => {
    const roomId = randomUUID()

    const [first, second] = await Promise.all([
      adopt(mine, localTab(roomId)),
      adopt(mine, localTab(roomId)),
    ])

    expect([first.status, second.status]).toEqual([200, 200])
    expect(await connection.collection('rooms').countDocuments({ roomId })).toBe(1)
    expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(1)
  })

  it('two accounts adopting the same id concurrently: exactly one wins, the other re-keys', async () => {
    const roomId = randomUUID()

    const results = await Promise.all([
      adopt(mine, localTab(roomId)),
      adopt(theirs, localTab(roomId)),
    ])

    const statuses = results.map(result => result.status).sort()
    expect(statuses).toEqual([200, 409])
    expect(await connection.collection('rooms').countDocuments({ roomId })).toBe(1)
    expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(1)

    const loser = results.find(result => result.status === 409)
    expect(loser?.body.code).toBe('room_id_taken')
  })

  // A factory the user added but never calculated carries `power: {}`, and plans in
  // that shape are already in browsers. Refusing one made the whole tab un-adoptable.
  it('adopts a plan holding a factory that was never calculated', async () => {
    const roomId = randomUUID()
    const uncalculated = makeFactory({ name: 'Never calculated', power: {} as never })

    const response = await adopt(mine, { ...localTab(roomId), factories: [uncalculated] })

    expect(response.status).toBe(200)

    const stored = await connection.collection('rooms').findOne({ roomId })
    expect((stored?.factories as { power: unknown }[])[0].power)
      .toEqual({ consumed: 0, produced: 0, difference: 0 })
  })

  /**
   * The zod schemas strip unknown keys, so a stored field missing from them is deleted here,
   * once, on the way in — and every later snapshot hands the loss back to every device. The
   * fixture carries the sink counts, the custom building, the checklist state and the rest, so
   * a field added to the interface and forgotten in the schema fails this.
   */
  it('stores the adopted plan whole, stripping nothing', async () => {
    const roomId = randomUUID()
    const tab = localTab(roomId)

    expect((await adopt(mine, tab)).status).toBe(200)

    const stored = await connection.collection('rooms').findOne({ roomId })
    expect(stored?.factories).toEqual(tab.factories)
    expect(stored?.depotUploadTier).toBe(1)
    expect(stored?.depotExpansionTier).toBe(3)
    expect(stored?.plannerVersion).toBe('0.6.0')
  })

  // Absent is a meaning: the tiers read as fully researched and an absent stamp means the plan
  // has not been answered for. Writing a value in would answer it on the user's behalf.
  it('leaves the tab settings unset when the local tab never stated them', async () => {
    const roomId = randomUUID()
    const { depotUploadTier, depotExpansionTier, plannerVersion, ...bare } = localTab(roomId)
    void [depotUploadTier, depotExpansionTier, plannerVersion]

    expect((await adopt(mine, bare)).status).toBe(200)

    const stored = await connection.collection('rooms').findOne({ roomId })
    expect(stored?.depotUploadTier).toBeUndefined()
    expect(stored?.depotExpansionTier).toBeUndefined()
    expect(stored?.plannerVersion).toBeUndefined()
  })

  it('requires a room id, unlike create', async () => {
    const response = await adopt(mine, { name: 'No id' })

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('invalid_payload')
  })
})
