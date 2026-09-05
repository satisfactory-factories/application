import fs from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

import { UNKNOWN_VERSION, resetAppVersionCache } from '../src/version/app-version'
import { VERSION_THROTTLE } from '../src/config/throttling'
import {
  TestContext,
  VERSION_HEADERS,
  awaitConnection,
  createTestApp,
  destroyTestApp,
} from './utils/test-app'

/**
 * What the deploy actually is: the repo root manifest, which every package versions from.
 * Named by the same fixed hop the image relies on (the process starts in `backend/`), so this
 * pins the answer rather than re-deriving it the way the code under test does.
 */
const rootVersion = (): string => {
  const manifest = path.resolve(process.cwd(), '..', 'package.json')
  return (JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version: string }).version
}

describe('GET /version', () => {
  let context: TestContext

  beforeAll(async () => {
    // An APP_VERSION in the environment wins over the manifest by design, so the assertion
    // that the two agree only means anything with it out of the way.
    delete process.env.APP_VERSION
    resetAppVersionCache()
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  it('answers with the deployed version and nothing else', async () => {
    const response = await request(context.app.getHttpServer()).get('/version')

    expect(response.status).toBe(200)
    expect(Object.keys(response.body)).toEqual(['version'])
    expect(typeof response.body.version).toBe('string')
  })

  it('reports the version in the repo root manifest', async () => {
    const response = await request(context.app.getHttpServer()).get('/version')

    expect(response.body.version).toBe(rootVersion())
    expect(response.body.version).not.toBe(UNKNOWN_VERSION)
  })

  // The whole point of the route is telling an out-of-date client that a newer build exists,
  // so it has to answer the clients the gate refuses. Every pre-v7 tab sends no header at all.
  it('is exempt from the version gate', async () => {
    const missing = await request(context.app.getHttpServer()).get('/version')
    const stale = await request(context.app.getHttpServer())
      .get('/version')
      .set('X-App-Version', '6.9')

    expect(missing.status).toBe(200)
    expect(stale.status).toBe(200)
    expect(stale.body.version).toBe(rootVersion())
  })

  it('refuses to be cached, or polling would learn nothing', async () => {
    const response = await request(context.app.getHttpServer()).get('/version')

    expect(response.headers['cache-control']).toBe('no-store')
  })
})

describe('the /version rate limiter', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  it(`allows ${VERSION_THROTTLE.limit} a minute in its own bucket, then 429s`, async () => {
    const server = context.app.getHttpServer()

    for (let attempt = 0; attempt < VERSION_THROTTLE.limit; attempt++) {
      expect((await request(server).get('/version')).status).toBe(200)
    }

    expect((await request(server).get('/version')).status).toBe(429)

    // The global bucket is untouched, so ordinary traffic still works.
    const login = await request(server)
      .post('/login')
      .set(VERSION_HEADERS)
      .send({ username: 'nobody', password: 'nobody' })
    expect(login.status).toBe(400)
  })
})
