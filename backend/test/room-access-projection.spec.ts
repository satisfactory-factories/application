import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getModelToken } from '@nestjs/mongoose'
import { makeFactory } from 'common/testing'
import type { Model } from 'mongoose'

import { Room } from '../src/rooms/schemas/room.schema'
import { RoomAccessService } from '../src/realtime/room-access.service'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'

/**
 * Authorization runs on every op, every lock and every revocation sweep, and nearly none
 * of those answer with a plan. The room document *is* the plan, so an unprojected read
 * here charged a whole-plan fetch to a message that could be ninety bytes.
 */
describe('room access reads only what it decides on', () => {
  let context: TestContext
  let owner: TestUser
  let roomId: string

  const rooms = () => context.app.get<Model<Room>>(getModelToken(Room.name))
  const access = () => context.app.get(RoomAccessService)

  /** Every projection the room `findOne` was given during the call; `undefined` for none. */
  const projectionsDuring = async (work: () => Promise<unknown>): Promise<unknown[]> => {
    const model = rooms()
    const seen: unknown[] = []
    const original = model.findOne.bind(model) as (...args: unknown[]) => unknown
    const spy = vi.spyOn(model, 'findOne').mockImplementation(((...args: unknown[]) => {
      seen.push(args[1])
      return original(...args)
    }) as never)

    try {
      await work()
    } finally {
      spy.mockRestore()
    }
    return seen
  }

  beforeAll(async () => {
    context = await createTestApp({ unthrottled: true })
    await awaitConnection(context.app)
    await buildIndexes(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    await resetRooms(context.app)
    owner = await registerAndLogin(context.app, 'owner')
    roomId = randomUUID()
    await call(context.app, 'post', '/rooms', owner)
      .send({ roomId, name: 'Iron Line', factories: [makeFactory({ id: 1, name: 'Smelters' })] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('grants without the plan, and still carries the revision a join needs', async () => {
    const granted = await access().authorize(roomId, { userId: owner.userId })

    expect(granted.status).toBe('granted')
    if (granted.status !== 'granted') return
    expect(granted.room).not.toHaveProperty('factories')
    expect(granted.room).not.toHaveProperty('name')
    expect(granted.room.revision).toBe(0)
    expect(granted.room.roomId).toBe(roomId)
  })

  it('fetches the plan only when the caller is going to serialise one', async () => {
    const granted = await access().authorizeWithContent(roomId, { userId: owner.userId })

    expect(granted.status).toBe('granted')
    if (granted.status !== 'granted') return
    expect(granted.room.factories).toHaveLength(1)
    expect(granted.room.name).toBe('Iron Line')
  })

  it('projects both reads of a decision that answers no snapshot', async () => {
    const seen = await projectionsDuring(() => access().authorize(roomId, { userId: owner.userId }))

    expect(seen).toHaveLength(2)
    for (const projection of seen) expect(projection).toMatchObject({ roomId: 1, revision: 1 })
    for (const projection of seen) expect(projection).not.toHaveProperty('factories')
  })

  // The re-read is the copy handed back, so it is the only one that may carry content.
  it('projects the first read even when the second must carry the plan', async () => {
    const seen = await projectionsDuring(() =>
      access().authorizeWithContent(roomId, { userId: owner.userId }))

    expect(seen).toHaveLength(2)
    expect(seen[0]).toMatchObject({ roomId: 1, revision: 1 })
    expect(seen[1]).toBeUndefined()
  })
})
