import { CAPS } from 'common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeFactory } from 'common/testing'
import request from 'supertest'
import type { Connection } from 'mongoose'

import { ANONYMOUS_SHARE_AUTHOR, ENDPOINT_REMOVED } from '../src/legacy/legacy.controller'
import { TestContext, VERSION_HEADERS, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, registerAndLogin } from './utils/rooms'

const SHARE = {
  id: 'microscopic-gifted-vase',
  data: JSON.stringify([{ id: 1, name: 'Iron Ingots' }]),
  createdBy: 'Anonymous',
  created: new Date('2024-01-01T00:00:00.000Z'),
  views: 4,
  lastViewed: new Date('2024-01-01T00:00:00.000Z'),
}

/** The smallest thing `factoryTabSchema` accepts, which is what /share now enforces. */
const tab = (factories = [makeFactory({ id: 1, name: 'Iron Ingots' })]) =>
  ({ id: 'b0a1c2d3', name: 'My plan', factories })

describe('legacy routes', () => {
  let context: TestContext
  let connection: Connection

  beforeAll(async () => {
    context = await createTestApp({ unthrottled: true })
    connection = await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    await connection.collection('shares').deleteMany({})
    await connection.collection('shares').insertOne({ ...SHARE })
  })

  describe('GET /share/:id', () => {
    it('returns the parsed plan under `data` and needs no version header', async () => {
      const response = await request(context.app.getHttpServer()).get(`/share/${SHARE.id}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ data: [{ id: 1, name: 'Iron Ingots' }] })
    })

    it('increments the view counter atomically and stamps lastViewed', async () => {
      const server = context.app.getHttpServer()
      await Promise.all(Array.from({ length: 5 }, () => request(server).get(`/share/${SHARE.id}`)))

      const stored = await connection.collection('shares').findOne({ id: SHARE.id })
      expect(stored?.views).toBe(SHARE.views + 5)
      expect(new Date(stored?.lastViewed as Date).getTime())
        .toBeGreaterThan(SHARE.lastViewed.getTime())
    })

    it('404s an unknown id without creating anything', async () => {
      const response = await request(context.app.getHttpServer()).get('/share/not-a-real-link')

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ message: 'Share link not found' })
      expect(await connection.collection('shares').countDocuments()).toBe(1)
    })
  })

  describe('POST /share', () => {
    const create = (body: unknown, token?: string) => {
      const call = request(context.app.getHttpServer()).post('/share').set(VERSION_HEADERS)
      return (token ? call.set('Authorization', `Bearer ${token}`) : call).send(body as object)
    }

    it('creates a snapshot link for an anonymous visitor', async () => {
      const response = await create(tab())

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('success')
      expect(response.body.shareId).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/)

      const stored = await connection.collection('shares').findOne({ id: response.body.shareId })
      expect(stored?.createdBy).toBe(ANONYMOUS_SHARE_AUTHOR)
      expect(JSON.parse(stored?.data as string).factories).toHaveLength(1)
    })

    it('records the author when the caller is signed in', async () => {
      const user: TestUser = await registerAndLogin(context.app, 'sharer')
      const response = await create(tab(), user.token)

      const stored = await connection.collection('shares').findOne({ id: response.body.shareId })
      expect(stored?.createdBy).toBe('sharer')
    })

    it('reads back through GET /share/:id byte for byte', async () => {
      const { body } = await create(tab())
      const response = await request(context.app.getHttpServer()).get(`/share/${body.shareId}`)

      expect(response.status).toBe(200)
      expect(response.body.data.name).toBe('My plan')
    })

    it('applies the caps table: over the factory cap is rejected, a long name is cut', async () => {
      const tooMany = Array.from({ length: CAPS.factoriesPerRoom + 1 }, (_, id) => makeFactory({ id }))
      expect((await create(tab(tooMany))).status).toBe(400)

      const { body } = await create({ ...tab(), name: 'x'.repeat(CAPS.name + 50) })
      const stored = await connection.collection('shares').findOne({ id: body.shareId })
      expect(JSON.parse(stored?.data as string).name).toHaveLength(CAPS.name)
    })

    it('is behind the version gate, unlike reading a link', async () => {
      const response = await request(context.app.getHttpServer()).post('/share').send(tab())

      expect(response.status).toBe(426)
    })
  })

  describe('the retired blob-sync routes', () => {
    it('410s POST /save', async () => {
      const response = await request(context.app.getHttpServer())
        .post('/save')
        .set(VERSION_HEADERS)
        .send([])

      expect(response.status).toBe(410)
      expect(response.body).toEqual(ENDPOINT_REMOVED)
    })

    it('410s GET /load', async () => {
      const response = await request(context.app.getHttpServer())
        .get('/load')
        .set(VERSION_HEADERS)

      expect(response.status).toBe(410)
      expect(response.body).toEqual(ENDPOINT_REMOVED)
    })
  })

  it('no longer serves GET /hello', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/hello')
      .set(VERSION_HEADERS)

    expect(response.status).toBe(404)
  })
})

describe('the /share creation rate limiter', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  it('keeps the old 5-per-5-minutes bucket on the share button', async () => {
    const create = () => request(context.app.getHttpServer())
      .post('/share')
      .set(VERSION_HEADERS)
      .send(tab())

    const statuses: number[] = []
    for (let attempt = 0; attempt < 6; attempt++) statuses.push((await create()).status)

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200])
    expect(statuses[5]).toBe(429)
  })
})
