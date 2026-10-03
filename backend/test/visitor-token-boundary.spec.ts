import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'

/**
 * A room visitor token is signed with the same secret as an account token, so a guard that
 * checks the signature alone accepts one: `user.id` and `user.username` are then both
 * undefined, and every route that reads them is answering an unauthenticated caller.
 */
describe('a room visitor token is not an account', () => {
  let context: TestContext
  let owner: TestUser
  let roomId: string
  let visitorToken: string

  const request = (method: 'get' | 'post' | 'put' | 'delete', path: string) =>
    call(context.app, method, path)

  /** The same call, carrying the visitor token where an account token belongs. */
  const asVisitor = (method: 'get' | 'post' | 'put' | 'delete', path: string) =>
    request(method, path).set('Authorization', `Bearer ${visitorToken}`)

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
    await call(context.app, 'post', '/rooms', owner).send({ roomId, name: 'Iron Line' })
    await call(context.app, 'post', `/rooms/${roomId}/share`, owner).send({})
    await call(context.app, 'put', `/rooms/${roomId}/password`, owner).send({ password: 'ficsit' })

    const { body } = await call(context.app, 'post', `/rooms/${roomId}/auth`)
      .send({ password: 'ficsit' })
    visitorToken = body.visitorToken as string
    expect(typeof visitorToken).toBe('string')
  })

  it('is refused by the room list', async () => {
    expect((await asVisitor('get', '/rooms')).status).toBe(401)
  })

  it('is refused by an owner mutation', async () => {
    const response = await asVisitor('put', `/rooms/${roomId}/name`).send({ name: 'Renamed' })

    expect(response.status).toBe(401)
    expect((await call(context.app, 'get', '/rooms', owner)).body.rooms[0].name).toBe('Iron Line')
  })

  it('is refused by both halves of the preferences route', async () => {
    expect((await asVisitor('get', '/preferences')).status).toBe(401)
    expect((await asVisitor('put', '/preferences').send({ prefs: {}, baseRevision: 0 })).status)
      .toBe(401)
  })

  it('is reported as invalid rather than decoded', async () => {
    const response = await request('post', '/validate-token').send({ token: visitorToken })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ valid: false, message: 'Invalid or expired token' })
  })

  it('still leaves an account token working on the same routes', async () => {
    expect((await call(context.app, 'get', '/rooms', owner)).status).toBe(200)
    expect((await call(context.app, 'get', '/preferences', owner)).status).toBe(200)
    expect((await request('post', '/validate-token').send({ token: owner.token })).body.valid)
      .toBe(true)
  })
})
