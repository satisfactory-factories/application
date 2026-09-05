import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { JwtService } from '@nestjs/jwt'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import type { Connection } from 'mongoose'

import { TestContext, VERSION_HEADERS, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'

const CREDENTIALS = { username: 'pioneer', password: 'ficsit-forever' }

describe('auth', () => {
  let context: TestContext
  let connection: Connection

  const post = (path: string) =>
    request(context.app.getHttpServer()).post(path).set(VERSION_HEADERS)

  beforeAll(async () => {
    // The suite logs in a dozen times from one address, which is more than the login
    // bucket allows on purpose. config.spec asserts the bucket itself.
    context = await createTestApp({ unthrottled: true })
    connection = await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    await connection.collection('users').deleteMany({})
  })

  describe('POST /register', () => {
    it('creates the account and answers 201', async () => {
      const response = await post('/register').send(CREDENTIALS)

      expect(response.status).toBe(201)
      expect(response.body).toEqual({ message: 'User registered successfully!' })

      const stored = await connection.collection('users').findOne({ username: CREDENTIALS.username })
      expect(stored).not.toBeNull()
      expect(stored?.password).not.toBe(CREDENTIALS.password)
      expect(stored?.registered).toBeInstanceOf(Date)
    })

    it('rejects a username over 100 characters', async () => {
      const response = await post('/register').send({ username: 'a'.repeat(101), password: 'x' })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Username too long.' })
    })

    it('rejects a password over 100 characters', async () => {
      const response = await post('/register').send({ username: 'pioneer', password: 'a'.repeat(101) })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Password too long.' })
    })

    it('refuses an email address as a username', async () => {
      const response = await post('/register').send({ username: 'a@b.com', password: 'x' })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        message: 'Please do not register with an email address. We do not wish to store PII.',
      })
    })

    it('refuses a duplicate username', async () => {
      await post('/register').send(CREDENTIALS)
      const response = await post('/register').send(CREDENTIALS)

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'User already exists.' })
    })

    it('answers 400 with the generic body when the request has no payload', async () => {
      const response = await post('/register').send()

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('Registration failed.')
    })
  })

  describe('POST /login', () => {
    beforeEach(async () => {
      await post('/register').send(CREDENTIALS)
    })

    it('answers 200 with an HS256 token carrying id and username', async () => {
      const response = await post('/login').send(CREDENTIALS)

      expect(response.status).toBe(200)
      expect(Object.keys(response.body)).toEqual(['token'])

      const decoded = jwt.decode(response.body.token, { complete: true })
      expect(decoded?.header.alg).toBe('HS256')

      const payload = decoded?.payload as jwt.JwtPayload
      expect(payload.username).toBe(CREDENTIALS.username)
      expect(typeof payload.id).toBe('string')
      // 30 days, to the minute.
      expect((payload.exp as number) - (payload.iat as number)).toBe(30 * 24 * 60 * 60)
    })

    it('answers 400 for an unknown user', async () => {
      const response = await post('/login').send({ username: 'ghost', password: 'x' })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Invalid credentials' })
    })

    it('answers 400 for a wrong password', async () => {
      const response = await post('/login').send({ ...CREDENTIALS, password: 'wrong' })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Invalid credentials' })
    })
  })

  describe('POST /validate-token', () => {
    it('answers 400 when no token is supplied', async () => {
      const response = await post('/validate-token').send({})

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Token is required' })
    })

    it('answers 400 when the body is missing entirely', async () => {
      const response = await post('/validate-token').send()

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Token is required' })
    })

    // Guards #172: the default 100kb body limit 413s a large plan.
    it('parses a body far larger than the express default', async () => {
      const response = await post('/validate-token').send({ token: 'a'.repeat(5_000_000) })

      expect(response.status).toBe(401)
    })

    it('answers 200 with the decoded payload for a valid token', async () => {
      await post('/register').send(CREDENTIALS)
      const { body } = await post('/login').send(CREDENTIALS)

      const response = await post('/validate-token').send({ token: body.token })

      expect(response.status).toBe(200)
      expect(response.body.valid).toBe(true)
      expect(response.body.decoded.username).toBe(CREDENTIALS.username)
    })

    it('answers 401 for a token signed with another secret', async () => {
      const foreign = jwt.sign({ id: 'x', username: 'x' }, 'not-the-secret')

      const response = await post('/validate-token').send({ token: foreign })

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ valid: false, message: 'Invalid or expired token' })
    })

    it('answers 401 for an expired token', async () => {
      const expired = context.app.get(JwtService).sign(
        { id: 'x', username: 'x' },
        { expiresIn: '-1s' },
      )

      const response = await post('/validate-token').send({ token: expired })

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ valid: false, message: 'Invalid or expired token' })
    })
  })

  describe('POST /me/password', () => {
    let token: string

    beforeEach(async () => {
      await post('/register').send(CREDENTIALS)
      token = (await post('/login').send(CREDENTIALS)).body.token
    })

    const changePassword = (body: Record<string, unknown>, bearer = token) =>
      post('/me/password').set('Authorization', `Bearer ${bearer}`).send(body)

    it('answers 401 with no Authorization header', async () => {
      const response = await post('/me/password').send({ currentPassword: 'a', newPassword: 'b' })

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ message: 'Unauthorized' })
    })

    it('answers 401 for a token signed with another secret', async () => {
      const foreign = jwt.sign({ id: 'x', username: 'x' }, 'not-the-secret')
      const response = await changePassword({ currentPassword: 'a', newPassword: 'b' }, foreign)

      expect(response.status).toBe(401)
      expect(response.body).toEqual({ message: 'Unauthorized' })
    })

    it('refuses a wrong current password and leaves the hash alone', async () => {
      const before = await connection.collection('users').findOne({ username: CREDENTIALS.username })

      const response = await changePassword({ currentPassword: 'wrong', newPassword: 'brand-new' })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Invalid credentials' })

      const after = await connection.collection('users').findOne({ username: CREDENTIALS.username })
      expect(after?.password).toBe(before?.password)
    })

    it('requires both passwords', async () => {
      const response = await changePassword({ currentPassword: CREDENTIALS.password })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Current and new password are required.' })
    })

    it('rejects a new password over 100 characters', async () => {
      const response = await changePassword({
        currentPassword: CREDENTIALS.password,
        newPassword: 'a'.repeat(101),
      })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Password too long.' })
    })

    it('stores a new bcrypt hash and lets the new password log in', async () => {
      const before = await connection.collection('users').findOne({ username: CREDENTIALS.username })

      const response = await changePassword({
        currentPassword: CREDENTIALS.password,
        newPassword: 'brand-new',
      })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ message: 'Password changed successfully!' })

      const after = await connection.collection('users').findOne({ username: CREDENTIALS.username })
      expect(after?.password).not.toBe(before?.password)
      expect(after?.password).not.toBe('brand-new')
      expect(String(after?.password)).toMatch(/^\$2[aby]\$/)

      expect((await post('/login').send({ ...CREDENTIALS, password: 'brand-new' })).status).toBe(200)
      expect((await post('/login').send(CREDENTIALS)).status).toBe(400)
    })
  })
})
