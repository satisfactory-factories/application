import { JwtService } from '@nestjs/jwt'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getModelToken } from '@nestjs/mongoose'
import { makeFactory } from 'common/testing'
import request from 'supertest'
import type { Connection, Model } from 'mongoose'

import { ANONYMOUS_SHARE_AUTHOR } from '../src/legacy/legacy.controller'
import { TestContext, VERSION_HEADERS, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, call, registerAndLogin } from './utils/rooms'
import { User } from '../src/auth/user.schema'

const PASSWORD = 'ficsit-forever'

/** The smallest thing `factoryTabSchema` accepts, for the optional-guard route. */
const tab = () => ({ id: 'b0a1c2d3', name: 'My plan', factories: [makeFactory({ id: 1, name: 'Iron' })] })

describe('account token versioning', () => {
  let context: TestContext
  let connection: Connection
  let users: Model<User>
  let user: TestUser

  const post = (path: string) =>
    request(context.app.getHttpServer()).post(path).set(VERSION_HEADERS)

  const changePassword = (token: string, newPassword: string) =>
    post('/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword })

  const storedUser = () => connection.collection('users').findOne({ username: user.username })

  beforeAll(async () => {
    context = await createTestApp({ unthrottled: true })
    connection = await awaitConnection(context.app)
    users = context.app.get<Model<User>>(getModelToken(User.name))
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    await connection.collection('users').deleteMany({})
    await connection.collection('shares').deleteMany({})
    user = await registerAndLogin(context.app, `pioneer-${Date.now()}`)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('the shape that is already in the wild', () => {
    /** An account and a token as they both exist today: neither carries a version. */
    const legacySession = async (): Promise<string> => {
      await connection.collection('users')
        .updateOne({ username: user.username }, { $unset: { tokenVersion: '' } })
      return context.app.get(JwtService).sign({ id: user.userId, username: user.username })
    }

    it('accepts a token with no version claim against an account with no version field', async () => {
      const token = await legacySession()

      const response = await request(context.app.getHttpServer())
        .get('/rooms').set(VERSION_HEADERS).set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
    })

    it('validates a token with no version claim', async () => {
      const token = await legacySession()

      const response = await post('/validate-token').send({ token })

      expect(response.status).toBe(200)
      expect(response.body.valid).toBe(true)
    })

    it('starts versioning that account at its first password change', async () => {
      const token = await legacySession()

      expect((await changePassword(token, 'brand-new')).status).toBe(200)

      expect((await storedUser())?.tokenVersion).toBe(1)
      const response = await request(context.app.getHttpServer())
        .get('/rooms').set(VERSION_HEADERS).set('Authorization', `Bearer ${token}`)
      expect(response.status).toBe(401)
    })
  })

  describe('after a password change', () => {
    it('mints tokens carrying the account version', async () => {
      await changePassword(user.token, 'brand-new')

      const { body } = await post('/login').send({ username: user.username, password: 'brand-new' })
      const decoded = context.app.get(JwtService).decode(body.token) as { tokenVersion?: number }

      expect(decoded.tokenVersion).toBe(1)
    })

    it('401s the superseded token on an authenticated route', async () => {
      await changePassword(user.token, 'brand-new')

      const response = await call(context.app, 'get', '/rooms', user)

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ message: 'Unauthorized' })
    })

    it('401s the superseded token on the password route itself', async () => {
      await changePassword(user.token, 'brand-new')

      const response = await post('/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'brand-new', newPassword: 'newer-still' })

      expect(response.status).toBe(401)
    })

    it('reports the superseded token invalid at validate-token', async () => {
      await changePassword(user.token, 'brand-new')

      const response = await post('/validate-token').send({ token: user.token })

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ valid: false, message: 'Invalid or expired token' })
    })

    it('accepts the token the next sign-in mints', async () => {
      await changePassword(user.token, 'brand-new')
      const { body } = await post('/login').send({ username: user.username, password: 'brand-new' })

      const response = await request(context.app.getHttpServer())
        .get('/rooms').set(VERSION_HEADERS).set('Authorization', `Bearer ${body.token}`)

      expect(response.status).toBe(200)
    })

    it('treats the superseded token as no token where the guard is optional', async () => {
      await changePassword(user.token, 'brand-new')

      const response = await post('/share')
        .set('Authorization', `Bearer ${user.token}`)
        .send(tab())

      expect(response.status).toBe(200)
      const stored = await connection.collection('shares').findOne({ id: response.body.shareId })
      expect(stored?.createdBy).toBe(ANONYMOUS_SHARE_AUTHOR)
    })

    it('leaves another account signed in', async () => {
      const other = await registerAndLogin(context.app, `other-${Date.now()}`)

      await changePassword(user.token, 'brand-new')

      expect((await call(context.app, 'get', '/rooms', other)).status).toBe(200)
    })
  })

  describe('the writes and the reads it costs', () => {
    it('writes the hash and the version bump in one update', async () => {
      const update = vi.spyOn(users, 'updateOne')

      await changePassword(user.token, 'brand-new')

      expect(update).toHaveBeenCalledTimes(1)
      const [, changes] = update.mock.calls[0] as [unknown, Record<string, Record<string, unknown>>]
      expect(changes.$inc).toEqual({ tokenVersion: 1 })
      expect(typeof changes.$set?.password).toBe('string')
      expect((await storedUser())?.tokenVersion).toBe(1)
    })

    it('leaves the version alone when the current password is wrong', async () => {
      const response = await post('/me/password')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ currentPassword: 'not-it', newPassword: 'brand-new' })

      expect(response.status).toBe(400)
      expect((await storedUser())?.tokenVersion).toBe(0)
      expect((await call(context.app, 'get', '/rooms', user)).status).toBe(200)
    })

    it('reads one projected field per authenticated request, never the password', async () => {
      const read = vi.spyOn(users, 'findById')

      await call(context.app, 'get', '/rooms', user)

      // The guard's read is the first the request makes, and it asks for one field.
      expect(read.mock.calls[0][1]).toEqual({ tokenVersion: 1 })

      const projected = await users.findById(user.userId, { tokenVersion: 1 }).lean()
      expect(Object.keys(projected ?? {}).sort()).toEqual(['_id', 'tokenVersion'])
    })
  })
})
