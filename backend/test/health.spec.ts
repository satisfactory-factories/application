import { APP_VERSION_HEADER } from 'common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { HEALTH_THROTTLE, SHARE_THROTTLE } from '../src/config/throttling'
import {
  TestContext,
  VERSION_HEADERS,
  awaitConnection,
  createTestApp,
  destroyTestApp,
} from './utils/test-app'

/** Documentation-range addresses, so nothing here reads as a real client. */
const REMOTE_PEER = '203.0.113.5'
const SPOOFING_PEER = '198.51.100.7'

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
      .set(APP_VERSION_HEADER, 'ancient')

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
  // supertest always connects over loopback, and loopback is exempt, so the bucket can only be
  // asserted from a peer that looks like an ordinary remote client.
  let peer = REMOTE_PEER

  beforeAll(async () => {
    context = await createTestApp({ peerAddress: () => peer })
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(() => {
    peer = REMOTE_PEER
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
      .set(APP_VERSION_HEADER, '7.0')
      .send({ username: 'nobody', password: 'nobody' })
    expect(login.status).toBe(400)
  })

  // The container's own healthcheck is the only caller that can reach /health over loopback, and
  // `up --wait` blocks on it, so counting it can only ever turn a healthy deploy into a failure.
  it.each([
    ['::ffff:127.0.0.1', 'the form Node reports for the container healthcheck'],
    ['127.0.0.1', 'plain IPv4 loopback'],
    ['::1', 'IPv6 loopback'],
    ['127.0.0.2', 'the rest of 127.0.0.0/8'],
  ])('never counts a probe from %s (%s)', async address => {
    peer = address
    const server = context.app.getHttpServer()

    for (let probe = 0; probe < HEALTH_THROTTLE.limit * 3; probe++) {
      expect((await request(server).get('/health')).status).toBe(200)
    }
  })

  // The security-relevant case: `trust proxy` makes req.ip header-derived, so the exemption has
  // to key on the TCP peer the kernel reports and not on anything a caller can send.
  it('does not let X-Forwarded-For claim to be loopback', async () => {
    peer = SPOOFING_PEER
    const server = context.app.getHttpServer()

    for (let attempt = 0; attempt < HEALTH_THROTTLE.limit; attempt++) {
      const response = await request(server).get('/health').set('X-Forwarded-For', '127.0.0.1')
      expect(response.status).toBe(200)
    }

    const throttled = await request(server).get('/health').set('X-Forwarded-For', '127.0.0.1')
    expect(throttled.status).toBe(429)
  })

  // The exemption is scoped to /health, so nothing else loses its bucket to a loopback caller.
  it('does not exempt any other route, even from loopback', async () => {
    peer = '127.0.0.1'
    const server = context.app.getHttpServer()

    const share = () => request(server).post('/share').set(VERSION_HEADERS).send({})

    for (let attempt = 0; attempt < SHARE_THROTTLE.limit; attempt++) {
      expect((await share()).status).not.toBe(429)
    }

    expect((await share()).status).toBe(429)
  })
})
