import { randomUUID } from 'node:crypto'

import { JwtService } from '@nestjs/jwt'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Connection } from 'mongoose'

import { RoomEventsService } from '../src/rooms/room-events.service'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'

describe('invite passwords and visitor tokens', () => {
  let context: TestContext
  let connection: Connection
  let owner: TestUser
  let joiner: TestUser
  let roomId: string
  let slug: string

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)
  const put = (path: string, as?: TestUser) => call(context.app, 'put', path, as)
  const get = (path: string, as?: TestUser) => call(context.app, 'get', path, as)
  const del = (path: string, as?: TestUser) => call(context.app, 'delete', path, as)

  const setPassword = (password: string) =>
    put(`/rooms/${roomId}/password`, owner).send({ password })

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
    joiner = await registerAndLogin(context.app, 'joiner')
    roomId = randomUUID()
    await post('/rooms', owner).send({ roomId, name: 'Shared plan' })
    slug = (await post(`/rooms/${roomId}/share`, owner).send({})).body.room.slug
  })

  describe('POST /rooms/:roomId/auth', () => {
    it('400s when the room has no password set', async () => {
      const response = await post(`/rooms/${roomId}/auth`).send({ password: 'anything' })

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('no_password_set')
    })

    it('401s a wrong password', async () => {
      await setPassword('ficsit')

      const response = await post(`/rooms/${roomId}/auth`).send({ password: 'wrong' })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('invalid_password')
    })

    it('issues a 7-day visitor token for the right password, with no account at all', async () => {
      await setPassword('ficsit')

      const response = await post(`/rooms/${roomId}/auth`).send({ password: 'ficsit' })

      expect(response.status).toBe(200)
      // Verified through the app's own signer rather than a literal secret: the
      // token has to be one this API would accept back.
      const payload = context.app.get(JwtService)
        .verify<Record<string, number | string>>(response.body.visitorToken)
      expect(payload).toMatchObject({ roomId, role: 'visitor', passwordVersion: 1 })
      expect((payload.exp as number) - (payload.iat as number)).toBe(7 * 24 * 60 * 60)
    })

    it('404s a tombstoned room and 403s an unshared one', async () => {
      await setPassword('ficsit')
      await post(`/rooms/${roomId}/unshare`, owner).send({})
      expect((await post(`/rooms/${roomId}/auth`).send({ password: 'ficsit' })).body.code)
        .toBe('not_shared')

      await del(`/rooms/${roomId}`, owner)
      expect((await post(`/rooms/${roomId}/auth`).send({ password: 'ficsit' })).status).toBe(404)
    })

    it('rejects a password outside 1-100 characters', async () => {
      expect((await setPassword('')).status).toBe(400)
      expect((await setPassword('a'.repeat(101))).status).toBe(400)
      expect((await setPassword('a'.repeat(100))).status).toBe(200)
    })

    it('stores a bcrypt hash, never the password', async () => {
      await setPassword('ficsit')

      const stored = await connection.collection('rooms').findOne({ roomId })
      expect(stored?.passwordHash).not.toBe('ficsit')
      expect(String(stored?.passwordHash)).toMatch(/^\$2[aby]\$12\$/)
    })
  })

  describe('POST /rooms/:roomId/join', () => {
    it('joins a shared room with no password and no token', async () => {
      const response = await post(`/rooms/${roomId}/join`, joiner).send({})

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('joined')
      expect(response.body.room.role).toBe('member')
      expect((await get('/rooms', joiner)).body.rooms).toHaveLength(1)
    })

    it('refuses a password-protected room without a visitor token', async () => {
      await setPassword('ficsit')

      const response = await post(`/rooms/${roomId}/join`, joiner).send({})

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('password_required')
      expect((await get('/rooms', joiner)).body.rooms).toEqual([])
    })

    it('accepts a visitor token from the correct password', async () => {
      await setPassword('ficsit')
      const { body } = await post(`/rooms/${roomId}/auth`).send({ password: 'ficsit' })

      const response = await post(`/rooms/${roomId}/join`, joiner)
        .send({ visitorToken: body.visitorToken })

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('joined')
    })

    it('refuses a visitor token minted for another room', async () => {
      await setPassword('ficsit')
      const otherRoomId = randomUUID()
      await post('/rooms', owner).send({ roomId: otherRoomId, name: 'Other' })
      await post(`/rooms/${otherRoomId}/share`, owner).send({})
      await put(`/rooms/${otherRoomId}/password`, owner).send({ password: 'ficsit' })
      const { body } = await post(`/rooms/${otherRoomId}/auth`).send({ password: 'ficsit' })

      const response = await post(`/rooms/${roomId}/join`, joiner)
        .send({ visitorToken: body.visitorToken })

      expect(response.status).toBe(401)
      expect(response.body.code).toBe('password_required')
    })

    it('is idempotent for an existing member', async () => {
      await post(`/rooms/${roomId}/join`, joiner).send({})

      const response = await post(`/rooms/${roomId}/join`, joiner).send({})

      expect(response.body.status).toBe('already_member')
      expect(await connection.collection('room_memberships').countDocuments({ roomId })).toBe(2)
    })

    it('refuses joining an unshared room', async () => {
      await post(`/rooms/${roomId}/unshare`, owner).send({})

      const response = await post(`/rooms/${roomId}/join`, joiner).send({})

      expect(response.status).toBe(403)
      expect(response.body.code).toBe('not_shared')
    })
  })

  describe('rotation and removal', () => {
    it('bumps passwordVersion on every change and kills outstanding visitor tokens', async () => {
      expect((await setPassword('first')).body.passwordVersion).toBe(1)
      const { body } = await post(`/rooms/${roomId}/auth`).send({ password: 'first' })

      const rotated = await setPassword('second')
      expect(rotated.body.passwordVersion).toBe(2)

      const stale = await post(`/rooms/${roomId}/join`, joiner)
        .send({ visitorToken: body.visitorToken })
      expect(stale.status).toBe(401)
      expect(stale.body.message).toMatch(/changed/i)

      const fresh = await post(`/rooms/${roomId}/auth`).send({ password: 'second' })
      expect((await post(`/rooms/${roomId}/join`, joiner)
        .send({ visitorToken: fresh.body.visitorToken })).status).toBe(200)
    })

    it('does not re-prompt an existing member after a rotation', async () => {
      await setPassword('first')
      const { body } = await post(`/rooms/${roomId}/auth`).send({ password: 'first' })
      await post(`/rooms/${roomId}/join`, joiner).send({ visitorToken: body.visitorToken })

      await setPassword('second')

      expect((await post(`/rooms/${roomId}/join`, joiner).send({})).body.status).toBe('already_member')
      expect((await get('/rooms', joiner)).body.rooms).toHaveLength(1)
    })

    it('emits access_revoked for visitors on set, rotate and remove', async () => {
      const seen: unknown[] = []
      context.app.get(RoomEventsService).on('access_revoked', payload => seen.push(payload))

      await setPassword('first')
      await setPassword('second')
      await del(`/rooms/${roomId}/password`, owner)

      expect(seen).toEqual(Array.from({ length: 3 }, () => ({ roomId, scope: 'visitors' })))
    })

    it('removal clears the hash, bumps the version and reopens the room', async () => {
      await setPassword('first')

      const response = await del(`/rooms/${roomId}/password`, owner)

      expect(response.status).toBe(200)
      expect(response.body.passwordVersion).toBe(2)
      expect((await connection.collection('rooms').findOne({ roomId }))?.passwordHash).toBeNull()
      expect((await get(`/rooms/by-slug/${slug}`)).body.hasPassword).toBe(false)
      expect((await post(`/rooms/${roomId}/join`, joiner).send({})).status).toBe(200)
    })

    it('reports hasPassword through the slug lookup and the room list', async () => {
      await setPassword('first')

      expect((await get(`/rooms/by-slug/${slug}`)).body)
        .toEqual({ roomId, name: 'Shared plan', hasPassword: true })
      expect((await get('/rooms', owner)).body.rooms[0].hasPassword).toBe(true)
    })

    it('records password activity and fans out to members', async () => {
      await post(`/rooms/${roomId}/join`, joiner).send({})
      const before = (await get('/rooms', joiner)).body.roomsRevision

      await setPassword('first')

      expect((await get('/rooms', joiner)).body.roomsRevision).toBe(before + 1)
      const kinds = (await connection.collection('room_activity').find({ roomId }).toArray())
        .map(row => row.kind)
      expect(kinds).toContain('password_set')
    })
  })
})
