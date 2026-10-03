import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Connection } from 'mongoose'

import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'

describe('preferences', () => {
  let context: TestContext
  let connection: Connection
  let user: TestUser

  const get = (as?: TestUser) => call(context.app, 'get', '/preferences', as)
  const put = (as: TestUser, body: object) =>
    call(context.app, 'put', '/preferences', as).send(body)

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
    user = await registerAndLogin(context.app, 'pioneer')
  })

  it('401s without a token', async () => {
    expect((await get()).status).toBe(401)
  })

  it('returns an empty set at revision 0 before anything is stored', async () => {
    const response = await get(user)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ prefs: {}, revision: 0 })
    expect(await connection.collection('user_preferences').countDocuments()).toBe(0)
  })

  it('stores the first write at revision 1 and reads it back', async () => {
    const prefs = { summaryHidden: true, factoryGroupCustomColors: ['#112233'] }

    const response = await put(user, { prefs, baseRevision: 0 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ prefs, revision: 1 })
    expect((await get(user)).body).toEqual({ prefs, revision: 1 })
  })

  it('advances the revision on each accepted write', async () => {
    await put(user, { prefs: { summaryHidden: true }, baseRevision: 0 })

    const second = await put(user, { prefs: { summaryHidden: false }, baseRevision: 1 })

    expect(second.body).toEqual({ prefs: { summaryHidden: false }, revision: 2 })
  })

  it('409s a stale baseRevision and hands back the current state', async () => {
    await put(user, { prefs: { summaryHidden: true }, baseRevision: 0 })

    const stale = await put(user, { prefs: { summaryHidden: false }, baseRevision: 0 })

    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('revision_mismatch')
    expect(stale.body).toMatchObject({ prefs: { summaryHidden: true }, revision: 1 })
    expect((await get(user)).body.prefs).toEqual({ summaryHidden: true })
  })

  it('409s a baseRevision ahead of the stored one', async () => {
    expect((await put(user, { prefs: {}, baseRevision: 7 })).status).toBe(409)
  })

  it('lets two devices race without either losing its answer', async () => {
    const results = await Promise.all([
      put(user, { prefs: { summaryHidden: true }, baseRevision: 0 }),
      put(user, { prefs: { summaryHidden: false }, baseRevision: 0 }),
    ])

    expect(results.map(result => result.status).sort()).toEqual([200, 409])
    expect(await connection.collection('user_preferences').countDocuments()).toBe(1)
  })

  it('strips keys that are not synced preferences', async () => {
    const response = await put(user, {
      prefs: { summaryHidden: true, windowWidth: 1920, 'some-device-thing': 'x' },
      baseRevision: 0,
    })

    expect(response.body.prefs).toEqual({ summaryHidden: true })
  })

  it('rejects a key with the wrong type', async () => {
    const response = await put(user, { prefs: { summaryHidden: 'yes' }, baseRevision: 0 })

    expect(response.status).toBe(400)
    expect(response.body.code).toBe('invalid_payload')
  })

  it('rejects a missing baseRevision rather than assuming zero', async () => {
    expect((await put(user, { prefs: {} })).status).toBe(400)
  })

  it('keeps each account\'s preferences to itself', async () => {
    const other = await registerAndLogin(context.app, 'other')
    await put(user, { prefs: { summaryHidden: true }, baseRevision: 0 })

    expect((await get(other)).body).toEqual({ prefs: {}, revision: 0 })
  })
})
