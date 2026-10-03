import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Connection } from 'mongoose'

import { EnsureStep } from '../src/rooms/ensure-step.runner'
import { FailingStepRunner, TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'

/** What the database should look like with the chain stopped at each step. */
interface PartialState {
  rooms: number
  memberships: number
  roomsRevision: number
  activity: number
}

describe('ensure-step resumption', () => {
  let context: TestContext
  let connection: Connection
  let owner: TestUser
  let member: TestUser
  const runner = new FailingStepRunner()

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)
  const del = (path: string, as?: TestUser) => call(context.app, 'delete', path, as)

  const counts = async (roomId: string, user: TestUser): Promise<PartialState> => ({
    rooms: await connection.collection('rooms').countDocuments({ roomId }),
    memberships: await connection.collection('room_memberships').countDocuments({ roomId }),
    roomsRevision: (await connection.collection('users').findOne({ username: user.username }))
      ?.roomsRevision as number,
    activity: await connection.collection('room_activity').countDocuments({ roomId }),
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
    owner = await registerAndLogin(context.app, 'owner')
    member = await registerAndLogin(context.app, 'member')
  })

  describe('create', () => {
    const expected: Record<string, PartialState> = {
      'ensure-room': { rooms: 0, memberships: 0, roomsRevision: 0, activity: 0 },
      'ensure-membership': { rooms: 1, memberships: 0, roomsRevision: 0, activity: 0 },
      'bump-rooms-revision': { rooms: 1, memberships: 1, roomsRevision: 0, activity: 0 },
      'record-activity': { rooms: 1, memberships: 1, roomsRevision: 1, activity: 0 },
    }

    it.each(Object.keys(expected))('resumes a create interrupted at %s', async step => {
      const roomId = randomUUID()
      const body = { roomId, name: 'Iron Line' }
      runner.failAt = step as EnsureStep

      expect((await post('/rooms', owner).send(body)).status).toBe(500)
      expect(await counts(roomId, owner)).toEqual(expected[step])

      runner.reset()
      const retry = await post('/rooms', owner).send(body)

      expect(retry.status).toBe(201)
      expect(retry.body.room).toMatchObject({ roomId, name: 'Iron Line', role: 'owner' })

      const final = await counts(roomId, owner)
      expect(final.rooms).toBe(1)
      expect(final.memberships).toBe(1)
      expect(final.activity).toBe(1)
      expect(final.roomsRevision).toBeGreaterThanOrEqual(1)
    })
  })

  describe('join', () => {
    let roomId: string

    beforeEach(async () => {
      roomId = randomUUID()
      await post('/rooms', owner).send({ roomId, name: 'Shared' })
      await post(`/rooms/${roomId}/share`, owner).send({})
    })

    it.each(['bump-rooms-revision', 'record-activity', 'ensure-membership'])(
      'resumes a join interrupted at %s',
      async step => {
        runner.failAt = step as EnsureStep
        expect((await post(`/rooms/${roomId}/join`, member).send({})).status).toBe(500)

        // The membership is written last, so an unfinished join is always visible.
        expect(await connection.collection('room_memberships')
          .countDocuments({ roomId, userId: member.userId })).toBe(0)

        runner.reset()
        const retry = await post(`/rooms/${roomId}/join`, member).send({})

        expect(retry.status).toBe(200)
        expect(retry.body.status).toBe('joined')
        expect(await connection.collection('room_memberships')
          .countDocuments({ roomId, userId: member.userId })).toBe(1)
        expect((await connection.collection('users').findOne({ username: member.username }))
          ?.roomsRevision).toBeGreaterThanOrEqual(1)
      },
    )

    // The row is written before the membership, so a resumed join runs it a second time.
    // Logging the same arrival twice also counts one collaborator as two in the totals.
    it('logs one arrival however many times the chain is resumed', async () => {
      runner.failAt = 'ensure-membership'
      expect((await post(`/rooms/${roomId}/join`, member).send({})).status).toBe(500)

      runner.reset()
      expect((await post(`/rooms/${roomId}/join`, member).send({})).status).toBe(200)

      expect(await connection.collection('room_activity')
        .countDocuments({ roomId, kind: 'joined', actor: member.userId })).toBe(1)
      expect((await connection.collection('room_totals').findOne({ kind: 'joined' }))?.value)
        .toBe(1)
    })
  })

  describe('leave', () => {
    let roomId: string

    beforeEach(async () => {
      roomId = randomUUID()
      await post('/rooms', owner).send({ roomId, name: 'Shared' })
      await post(`/rooms/${roomId}/share`, owner).send({})
      await post(`/rooms/${roomId}/join`, member).send({})
    })

    it.each(['bump-rooms-revision', 'record-activity', 'remove-membership'])(
      'resumes a leave interrupted at %s',
      async step => {
        runner.failAt = step as EnsureStep
        expect((await post(`/rooms/${roomId}/leave`, member).send({})).status).toBe(500)
        expect(await connection.collection('room_memberships')
          .countDocuments({ roomId, userId: member.userId })).toBe(1)

        runner.reset()
        expect((await post(`/rooms/${roomId}/leave`, member).send({})).status).toBe(200)
        expect(await connection.collection('room_memberships')
          .countDocuments({ roomId, userId: member.userId })).toBe(0)
      },
    )

    it('logs one departure however many times the chain is resumed', async () => {
      runner.failAt = 'remove-membership'
      expect((await post(`/rooms/${roomId}/leave`, member).send({})).status).toBe(500)

      runner.reset()
      expect((await post(`/rooms/${roomId}/leave`, member).send({})).status).toBe(200)

      expect(await connection.collection('room_activity')
        .countDocuments({ roomId, kind: 'left', actor: member.userId })).toBe(1)
      expect((await connection.collection('room_totals').findOne({ kind: 'left' }))?.value).toBe(1)
    })
  })

  describe('unshare', () => {
    let roomId: string

    beforeEach(async () => {
      roomId = randomUUID()
      await post('/rooms', owner).send({ roomId, name: 'Shared' })
      await post(`/rooms/${roomId}/share`, owner).send({})
      await post(`/rooms/${roomId}/join`, member).send({})
      runner.reset()
    })

    it.each(['update-room-meta', 'bump-rooms-revision', 'remove-memberships'])(
      'resumes an unshare interrupted at %s',
      async step => {
        runner.failAt = step as EnsureStep
        expect((await post(`/rooms/${roomId}/unshare`, owner).send({})).status).toBe(500)

        runner.reset()
        expect((await post(`/rooms/${roomId}/unshare`, owner).send({})).status).toBe(200)

        const room = await connection.collection('rooms').findOne({ roomId })
        expect(room?.shared).toBe(false)
        expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(1)
        expect((await connection.collection('room_memberships').findOne({ roomId }))?.role).toBe('owner')
      },
    )

    // The revocation has fully landed by this point; a 500 would report the room
    // as still shared and invite the owner to retry something already done.
    it('succeeds when only the activity row fails to write', async () => {
      runner.failAt = 'record-activity'

      const response = await post(`/rooms/${roomId}/unshare`, owner).send({})

      expect(response.status).toBe(200)
      expect(response.body.room.shared).toBe(false)
      expect((await connection.collection('rooms').findOne({ roomId }))?.shared).toBe(false)
      expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(1)
      expect(await connection.collection('room_activity')
        .countDocuments({ roomId, kind: 'unshared' })).toBe(0)
    })
  })

  describe('tombstone-first delete', () => {
    let roomId: string

    const partial: Record<string, { deleted: boolean, memberships: number }> = {
      'tombstone-room': { deleted: false, memberships: 2 },
      'bump-rooms-revision': { deleted: true, memberships: 2 },
      'remove-memberships': { deleted: true, memberships: 2 },
      'record-activity': { deleted: true, memberships: 0 },
    }

    beforeEach(async () => {
      roomId = randomUUID()
      await post('/rooms', owner).send({ roomId, name: 'Doomed' })
      await post(`/rooms/${roomId}/share`, owner).send({})
      await post(`/rooms/${roomId}/join`, member).send({})
      runner.reset()
    })

    it.each(Object.keys(partial))('resumes a delete interrupted at %s', async step => {
      runner.failAt = step as EnsureStep

      expect((await del(`/rooms/${roomId}`, owner)).status).toBe(500)

      const room = await connection.collection('rooms').findOne({ roomId })
      expect(room?.deletedAt !== null).toBe(partial[step].deleted)
      expect(await connection.collection('room_memberships').countDocuments({ roomId }))
        .toBe(partial[step].memberships)

      runner.reset()
      expect((await del(`/rooms/${roomId}`, owner)).status).toBe(200)

      const after = await connection.collection('rooms').findOne({ roomId })
      expect(after?.deletedAt).toBeInstanceOf(Date)
      expect(after?.shared).toBe(false)
      expect(after?.slug).toBeNull()
      expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(0)
      expect(await connection.collection('room_activity')
        .countDocuments({ roomId, kind: 'deleted' })).toBe(1)
    })

    it('lets nobody but the record\'s owner finish a started delete', async () => {
      runner.failAt = 'remove-memberships'
      expect((await del(`/rooms/${roomId}`, owner)).status).toBe(500)

      runner.reset()
      // The member still has a membership row at this point, and it buys nothing.
      expect((await del(`/rooms/${roomId}`, member)).status).toBe(403)
      expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(2)

      expect((await del(`/rooms/${roomId}`, owner)).status).toBe(200)
    })

    it('keeps the room inert between the tombstone and the cleanup', async () => {
      runner.failAt = 'bump-rooms-revision'
      expect((await del(`/rooms/${roomId}`, owner)).status).toBe(500)

      expect((await call(context.app, 'put', `/rooms/${roomId}/name`, owner).send({ name: 'x' })).status)
        .toBe(404)
      expect((await post(`/rooms/${roomId}/join`, member).send({})).status).toBe(404)
      expect((await call(context.app, 'get', '/rooms', owner)).body.rooms).toEqual([])
    })
  })

  describe('legacy import', () => {
    beforeEach(async () => {
      await connection.collection('factorydatas').insertOne({
        user: owner.username,
        data: [{ id: 1, name: 'Old plan' }],
        lastSaved: new Date(),
      })
    })

    it.each(['ensure-room', 'ensure-membership', 'bump-rooms-revision', 'record-activity', 'stamp-legacy-import'])(
      'resumes a recover interrupted at %s',
      async step => {
        runner.failAt = step as EnsureStep
        expect((await post('/rooms/legacy/recover', owner).send({})).status).toBe(500)

        const stamped = (await connection.collection('users').findOne({ username: owner.username }))
          ?.legacyImportRoomId
        expect(stamped).toBeNull()

        runner.reset()
        const retry = await post('/rooms/legacy/recover', owner).send({})

        expect(retry.status).toBe(200)
        expect(retry.body.imported).toBe(true)

        const roomId = retry.body.room.roomId
        expect(await connection.collection('rooms').countDocuments({ roomId })).toBe(1)
        expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(1)
        expect(await connection.collection('room_activity')
          .countDocuments({ roomId, kind: 'imported' })).toBe(1)
        expect((await connection.collection('users').findOne({ username: owner.username }))
          ?.legacyImportRoomId).toBe(roomId)
      },
    )
  })
})
