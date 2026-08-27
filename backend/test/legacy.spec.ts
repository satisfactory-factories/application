import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Connection } from 'mongoose'

import { ENDPOINT_REMOVED } from '../src/legacy/legacy.controller'
import { TestContext, VERSION_HEADERS, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'

const SHARE = {
  id: 'microscopic-gifted-vase',
  data: JSON.stringify([{ id: 1, name: 'Iron Ingots' }]),
  createdBy: 'Anonymous',
  created: new Date('2024-01-01T00:00:00.000Z'),
  views: 4,
  lastViewed: new Date('2024-01-01T00:00:00.000Z'),
}

describe('legacy routes', () => {
  let context: TestContext
  let connection: Connection

  beforeAll(async () => {
    context = await createTestApp()
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
