import { APP_VERSION_HEADER, APP_VERSION_HEADER_FALLBACK, PROTOCOL_VERSION } from 'common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'

describe('the client version gate', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  const server = () => context.app.getHttpServer()

  it('426s a gated route when the header is missing, as every pre-v7 client is', async () => {
    const response = await request(server()).post('/login').send({ username: 'a', password: 'b' })

    expect(response.status).toBe(426)
    expect(response.body).toEqual({
      code: 'version_mismatch',
      message: 'This version of the planner is out of date. Please refresh the page.',
      requiredVersion: PROTOCOL_VERSION,
      receivedVersion: null,
    })
  })

  it('426s a stale version and echoes what was sent', async () => {
    const response = await request(server())
      .post('/login')
      .set(APP_VERSION_HEADER, '6.9')
      .send({ username: 'a', password: 'b' })

    expect(response.status).toBe(426)
    expect(response.body.code).toBe('version_mismatch')
    expect(response.body.receivedVersion).toBe('6.9')
  })

  it('lets the current version through to the handler', async () => {
    const response = await request(server())
      .post('/login')
      .set(APP_VERSION_HEADER, PROTOCOL_VERSION)
      .send({ username: 'nobody', password: 'nobody' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid credentials' })
  })

  it('gates every route without the decorator', async () => {
    const gated = [
      ['post', '/register'],
      ['post', '/login'],
      ['post', '/validate-token'],
      ['post', '/me/password'],
      ['post', '/save'],
      ['get', '/load'],
    ] as const

    for (const [method, path] of gated) {
      const response = await request(server())[method](path)
      expect.soft(`${method} ${path} -> ${response.status}`).toBe(`${method} ${path} -> 426`)
    }
  })

  // /version is exempt for the opposite reason to the others: it exists to tell a client the
  // gate would refuse that a newer build is out.
  it('exempts only GET /health, GET /version and GET /share/:id', async () => {
    expect((await request(server()).get('/health')).status).toBe(200)
    expect((await request(server()).get('/version')).status).toBe(200)
    expect((await request(server()).get('/share/anything')).status).toBe(404)
  })

  // A v0.7.x build sends the fallback name and nothing else. It has to reach the gate and be
  // judged on its version, rather than being refused for the name it used.
  describe('the fallback header name v0.7.x builds send', () => {
    it('accepts a current version sent only under the fallback name', async () => {
      const response = await request(server())
        .post('/login')
        .set(APP_VERSION_HEADER_FALLBACK, PROTOCOL_VERSION)
        .send({ username: 'nobody', password: 'nobody' })

      expect(response.status).toBe(400)
      expect(response.body).toEqual({ message: 'Invalid credentials' })
    })

    it('426s a stale version sent only under the fallback name', async () => {
      const response = await request(server())
        .post('/login')
        .set(APP_VERSION_HEADER_FALLBACK, '6.9')
        .send({ username: 'a', password: 'b' })

      expect(response.status).toBe(426)
      expect(response.body.receivedVersion).toBe('6.9')
    })

    it('prefers the primary name when a client sends both', async () => {
      const response = await request(server())
        .post('/login')
        .set(APP_VERSION_HEADER, '6.9')
        .set(APP_VERSION_HEADER_FALLBACK, PROTOCOL_VERSION)
        .send({ username: 'a', password: 'b' })

      expect(response.status).toBe(426)
      expect(response.body.receivedVersion).toBe('6.9')
    })

    it('still refuses a request carrying neither name', async () => {
      const response = await request(server())
        .post('/login')
        .set('X-Some-Other-Version', PROTOCOL_VERSION)
        .send({ username: 'a', password: 'b' })

      expect(response.status).toBe(426)
      expect(response.body.code).toBe('version_mismatch')
      expect(response.body.receivedVersion).toBeNull()
    })
  })
})
