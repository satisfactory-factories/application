import { APP_VERSION_HEADER } from 'common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

import { WEB_ORIGINS } from '../src/config/cors'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'

const PRODUCTION_ORIGIN = 'https://satisfactory-factories.app'

describe('CORS', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  it('allows the production web origin, not the API origin', () => {
    expect(WEB_ORIGINS).toContain(PRODUCTION_ORIGIN)
    expect(WEB_ORIGINS).toContain('http://localhost:3000')
    expect(WEB_ORIGINS).not.toContain('https://api.satisfactory-factories.app')
  })

  it('answers the preflight that X-App-Version now forces on every gated call', async () => {
    const response = await request(context.app.getHttpServer())
      .options('/login')
      .set('Origin', PRODUCTION_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', `content-type,${APP_VERSION_HEADER.toLowerCase()}`)

    expect(response.status).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN)
    expect(response.headers['access-control-allow-headers'].toLowerCase())
      .toContain(APP_VERSION_HEADER.toLowerCase())
    expect(response.headers['access-control-allow-methods']).toContain('POST')
  })

  it('reflects the allowed origin on the real request', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/login')
      .set('Origin', PRODUCTION_ORIGIN)
      .set(APP_VERSION_HEADER, '7.0')
      .send({ username: 'nobody', password: 'nobody' })

    expect(response.headers['access-control-allow-origin']).toBe(PRODUCTION_ORIGIN)
  })

  it('does not allow an unknown origin', async () => {
    const response = await request(context.app.getHttpServer())
      .options('/login')
      .set('Origin', 'https://not-the-planner.example')
      .set('Access-Control-Request-Method', 'POST')

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})
