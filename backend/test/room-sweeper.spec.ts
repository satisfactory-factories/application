import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Connection } from 'mongoose'

import { ACTIVITY_PER_ROOM, ORPHAN_GRACE_MS, RoomSweeperService, SWEEP_INTERVAL_MS } from '../src/rooms/room-sweeper.service'
import { FakeClock, TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'

describe('the hourly room sweeper', () => {
  let context: TestContext
  let connection: Connection
  let owner: TestUser
  let sweeper: RoomSweeperService
  const clock = new FakeClock()

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)
  const del = (path: string, as?: TestUser) => call(context.app, 'delete', path, as)

  const createRoom = async (name = 'Plan'): Promise<string> => {
    const roomId = randomUUID()
    await post('/rooms', owner).send({ roomId, name })
    return roomId
  }

  const dropMemberships = (roomId: string) =>
    connection.collection('room_memberships').deleteMany({ roomId })

  const roomExists = async (roomId: string): Promise<boolean> =>
    await connection.collection('rooms').countDocuments({ roomId }) === 1

  beforeAll(async () => {
    context = await createTestApp({ clock, unthrottled: true })
    connection = await awaitConnection(context.app)
    await buildIndexes(context.app)
    sweeper = context.app.get(RoomSweeperService)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    clock.reset()
    await resetRooms(context.app)
    owner = await registerAndLogin(context.app, 'owner')
  })

  it('runs on the hour and grants orphans a day', () => {
    expect(SWEEP_INTERVAL_MS).toBe(60 * 60 * 1000)
    expect(ORPHAN_GRACE_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('purges a tombstoned room with its memberships and activity, shared or not', async () => {
    const shared = await createRoom('Shared')
    await post(`/rooms/${shared}/share`, owner).send({})
    const privateRoom = await createRoom('Private')

    await del(`/rooms/${shared}`, owner)
    await del(`/rooms/${privateRoom}`, owner)

    const summary = await sweeper.sweep()

    expect(summary.tombstonedRooms).toBe(2)
    expect(await roomExists(shared)).toBe(false)
    expect(await roomExists(privateRoom)).toBe(false)
    expect(await connection.collection('room_memberships').countDocuments()).toBe(0)
    expect(await connection.collection('room_activity').countDocuments()).toBe(0)
  })

  it('purges a membership-less private room once it is a day old', async () => {
    const roomId = await createRoom()
    await dropMemberships(roomId)

    expect((await sweeper.sweep()).orphanRooms).toBe(0)
    expect(await roomExists(roomId)).toBe(true)

    clock.advance(ORPHAN_GRACE_MS + 60_000)

    expect((await sweeper.sweep()).orphanRooms).toBe(1)
    expect(await roomExists(roomId)).toBe(false)
  })

  it('spares a fresh adoption that has not got its membership yet', async () => {
    const roomId = await createRoom('Half-adopted')
    await dropMemberships(roomId)

    clock.advance(ORPHAN_GRACE_MS - 60_000)
    await sweeper.sweep()

    expect(await roomExists(roomId)).toBe(true)
  })

  it('spares a shared room with no memberships, however old', async () => {
    const roomId = await createRoom('Abandoned but shared')
    await post(`/rooms/${roomId}/share`, owner).send({})
    await dropMemberships(roomId)

    clock.advance(ORPHAN_GRACE_MS * 10)
    await sweeper.sweep()

    expect(await roomExists(roomId)).toBe(true)
  })

  it('spares an old private room that still has a member', async () => {
    const roomId = await createRoom('Still mine')

    clock.advance(ORPHAN_GRACE_MS * 2)
    await sweeper.sweep()

    expect(await roomExists(roomId)).toBe(true)
  })

  it('trims the activity log to the newest 200 rows per room', async () => {
    const kept = await createRoom('Busy')
    const quiet = await createRoom('Quiet')
    const base = clock.now().getTime()

    await connection.collection('room_activity').insertMany(
      Array.from({ length: ACTIVITY_PER_ROOM + 5 }, (_unused, index) => ({
        roomId: kept,
        at: new Date(base + index),
        actor: owner.userId,
        kind: 'op',
        summary: `op ${index}`,
      })),
    )

    const summary = await sweeper.sweep()

    expect(summary.activityTrimmed).toBe(6) // The five extras plus the 'created' row.
    expect(await connection.collection('room_activity').countDocuments({ roomId: kept }))
      .toBe(ACTIVITY_PER_ROOM)
    expect(await connection.collection('room_activity').countDocuments({ roomId: quiet })).toBe(1)

    const oldest = await connection.collection('room_activity')
      .find({ roomId: kept }).sort({ at: 1 }).limit(1).toArray()
    expect(oldest[0].summary).toBe('op 5')
  })

  it('is safe to run twice over the same data', async () => {
    const roomId = await createRoom()
    await del(`/rooms/${roomId}`, owner)

    await sweeper.sweep()
    const second = await sweeper.sweep()

    expect(second).toEqual({ tombstonedRooms: 0, orphanRooms: 0, activityTrimmed: 0 })
  })
})
