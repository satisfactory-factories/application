import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getModelToken } from '@nestjs/mongoose'
import type { Connection, Model } from 'mongoose'

import { ACTIVITY_PER_ROOM, ORPHAN_GRACE_MS, RoomSweeperService, SWEEP_INTERVAL_MS } from '../src/rooms/room-sweeper.service'
import { CLOCK } from '../src/rooms/clock'
import { EventCountersService } from '../src/event-counters/event-counters.service'
import { FakeClock, TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { Room } from '../src/rooms/schemas/room.schema'
import { RoomActivity } from '../src/rooms/schemas/room-activity.schema'
import { RoomMembership } from '../src/rooms/schemas/room-membership.schema'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'

/** Grants the membership between the sweep's two membership reads, and only once. */
class RacingSweeper extends RoomSweeperService {
  grant: (() => Promise<void>) | null = null

  protected override async heldRoomIds (roomIds: string[]): Promise<Set<string>> {
    const held = await super.heldRoomIds(roomIds)
    const grant = this.grant
    this.grant = null
    if (grant) await grant()
    return held
  }
}

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

  afterEach(() => {
    vi.restoreAllMocks()
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

  /**
   * The read that decides a room is an orphan is minutes of sweeping old by the time the
   * delete runs, and a join in that gap would otherwise have its room destroyed under it.
   */
  it('spares a room somebody joined between the decision and the delete', async () => {
    const roomId = await createRoom('Nearly abandoned')
    await dropMemberships(roomId)
    clock.advance(ORPHAN_GRACE_MS + 60_000)

    const racing = new RacingSweeper(
      context.app.get<Model<Room>>(getModelToken(Room.name)),
      context.app.get<Model<RoomMembership>>(getModelToken(RoomMembership.name)),
      context.app.get<Model<RoomActivity>>(getModelToken(RoomActivity.name)),
      context.app.get(CLOCK),
      context.app.get(EventCountersService),
    )
    racing.grant = async () => {
      await connection.collection('room_memberships').insertOne({
        roomId, userId: owner.userId, role: 'member', order: 0, epoch: 0, joinedAt: new Date(),
      })
    }

    expect((await racing.sweep()).orphanRooms).toBe(0)
    expect(await roomExists(roomId)).toBe(true)
  })

  // A room document is a whole plan, and the sweep wants nothing from it but the id.
  it('reads only the ids it is about to delete', async () => {
    const roomId = await createRoom('Doomed')
    await del(`/rooms/${roomId}`, owner)

    const model = context.app.get<Model<Room>>(getModelToken(Room.name))
    const original = model.find.bind(model) as (...args: unknown[]) => unknown
    const projections: unknown[] = []
    vi.spyOn(model, 'find').mockImplementation(((...args: unknown[]) => {
      projections.push(args[1])
      return original(...args)
    }) as never)

    await sweeper.sweep()

    expect(projections.length).toBeGreaterThan(0)
    for (const projection of projections) expect(projection).toEqual({ roomId: 1 })
  })

  it('is safe to run twice over the same data', async () => {
    const roomId = await createRoom()
    await del(`/rooms/${roomId}`, owner)

    await sweeper.sweep()
    const second = await sweeper.sweep()

    expect(second).toEqual({ tombstonedRooms: 0, orphanRooms: 0, activityTrimmed: 0 })
  })
})
