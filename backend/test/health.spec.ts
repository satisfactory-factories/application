import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

import { HEALTH_THROTTLE } from '../src/config/throttling'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'

describe('GET /health', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  it('returns the monitored shape with a live database', async () => {
    const response = await request(context.app.getHttpServer()).get('/health')

    expect(response.status).toBe(200)
    expect(Object.keys(response.body)).toEqual(['status', 'uptime', 'database'])
    expect(response.body.status).toBe('ok')
    expect(typeof response.body.uptime).toBe('number')
    expect(Object.keys(response.body.database)).toEqual(['status', 'state', 'responseTime'])
    expect(response.body.database.status).toBe('ok')
    expect(response.body.database.state).toBe('connected')
    expect(typeof response.body.database.responseTime).toBe('number')
    expect(response.body.database.error).toBeUndefined()
  })

  it('is exempt from the version gate', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/health')
      .set('X-App-Version', 'ancient')

    expect(response.status).toBe(200)
  })

  it('returns 503 with an error string when the database is unreachable', async () => {
    const connection = await awaitConnection(context.app)
    await connection.close()

    const response = await request(context.app.getHttpServer()).get('/health')

    expect(response.status).toBe(503)
    expect(response.body.status).toBe('fail')
    expect(response.body.database.status).toBe('fail')
    expect(response.body.database.state).toBe('disconnected')
    expect(typeof response.body.database.error).toBe('string')
    expect(response.body.database.error.length).toBeGreaterThan(0)
  })
})

describe('the /health rate limiter', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  it(`allows ${HEALTH_THROTTLE.limit} a minute in its own bucket, then 429s`, async () => {
    const server = context.app.getHttpServer()

    for (let attempt = 0; attempt < HEALTH_THROTTLE.limit; attempt++) {
      expect((await request(server).get('/health')).status).toBe(200)
    }

    expect((await request(server).get('/health')).status).toBe(429)

    // The global bucket is untouched, so ordinary traffic still works.
    const login = await request(server)
      .post('/login')
      .set('X-App-Version', '7.0')
      .send({ username: 'nobody', password: 'nobody' })
    expect(login.status).toBe(400)
  })
})
