import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getModelToken } from '@nestjs/mongoose'
import request from 'supertest'
import type { Model } from 'mongoose'

import { METRICS_CACHE_MS, METRICS_TOKEN_VAR } from '../src/metrics/metrics.constants'
import { METRICS_THROTTLE } from '../src/config/throttling'
import { Room } from '../src/rooms/schemas/room.schema'
import { RoomMembership } from '../src/rooms/schemas/room-membership.schema'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { User } from '../src/auth/user.schema'
import { FakeClock, resetRooms } from './utils/rooms'
import {
  METRICS_TOKEN as TOKEN,
  clearMetricsToken,
  sample,
  scrapeMetrics,
  useMetricsToken,
} from './utils/metrics'

const withToken = (context: TestContext) => scrapeMetrics(context.app)

describe('GET /metrics: who is allowed to ask', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
    clearMetricsToken()
  })

  beforeEach(() => {
    useMetricsToken()
  })

  it('is not mounted at all when no token is configured', async () => {
    clearMetricsToken()

    const response = await request(context.app.getHttpServer()).get('/metrics')

    expect(response.status).toBe(404)
  })

  // The whole point of the 404: a box that never got the variable must not answer 401,
  // because a 401 says "there is something here" to anyone who asks.
  it('still 404s for a caller holding the right token, when the variable is unset', async () => {
    clearMetricsToken()

    expect((await withToken(context)).status).toBe(404)
  })

  it('treats a blank token as unset', async () => {
    process.env[METRICS_TOKEN_VAR] = '   '

    expect((await request(context.app.getHttpServer()).get('/metrics')).status).toBe(404)
  })

  it('401s with no Authorization header', async () => {
    const response = await request(context.app.getHttpServer()).get('/metrics')

    expect(response.status).toBe(401)
  })

  it.each([
    ['the wrong token', `Bearer ${TOKEN}-nope`],
    ['a prefix of the right token', `Bearer ${TOKEN.slice(0, 8)}`],
    ['the token without the Bearer scheme', TOKEN],
    ['basic auth', `Basic ${Buffer.from(`x:${TOKEN}`).toString('base64')}`],
    ['an empty bearer', 'Bearer '],
  ])('401s with %s', async (_label, header) => {
    const response = await request(context.app.getHttpServer())
      .get('/metrics')
      .set('Authorization', header)

    expect(response.status).toBe(401)
  })

  it('serves the Prometheus text exposition format with the right token', async () => {
    const response = await withToken(context)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/plain')
    expect(response.headers['content-type']).toContain('version=0.0.4')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.text).toContain('# HELP sf_rooms_total')
    expect(response.text).toContain('# TYPE sf_rooms_total gauge')
  })

  // Same reason /health is exempt: the caller is a scraper and has no app version to send.
  it('is exempt from the version gate', async () => {
    const response = await withToken(context).set('X-App-Version', 'ancient')

    expect(response.status).toBe(200)
  })

  it('names every metric it promises to serve', async () => {
    const { text } = await withToken(context)

    for (const metric of [
      'sf_rooms_total',
      'sf_room_factories_total',
      'sf_room_members_total',
      'sf_users_total',
      'sf_ws_connections',
      'sf_active_clients',
      'sf_client_tabs',
      'sf_client_factories_total',
      'sf_metrics_database_up',
    ]) {
      expect(text).toContain(`# TYPE ${metric} gauge`)
    }
  })
})

describe('GET /metrics: the numbers', () => {
  let context: TestContext
  const clock = new FakeClock()

  const rooms = () => context.app.get<Model<Room>>(getModelToken(Room.name))
  const memberships = () => context.app.get<Model<RoomMembership>>(getModelToken(RoomMembership.name))
  const users = () => context.app.get<Model<User>>(getModelToken(User.name))

  const seedRoom = async (factories: number, overrides: Partial<Room> = {}) =>
    rooms().create({
      roomId: randomUUID(),
      name: 'Iron Line',
      createdBy: 'someone',
      factories: Array.from({ length: factories }, (_unused, index) => ({ id: index })),
      ...overrides,
    })

  /** Past the cache every time, so each case reads the database it just seeded. */
  const scrape = async (): Promise<string> => {
    clock.advance(METRICS_CACHE_MS + 1)
    const response = await withToken(context)
    expect(response.status).toBe(200)
    return response.text
  }

  beforeAll(async () => {
    context = await createTestApp({ clock, unthrottled: true })
    await awaitConnection(context.app)
    useMetricsToken()
  })

  afterAll(async () => {
    await destroyTestApp(context)
    clearMetricsToken()
  })

  // The clock is never reset, only advanced: winding it back would put the previous
  // case's cache stamp in the future, and every scrape after it would read that instead.
  beforeEach(async () => {
    await resetRooms(context.app)
  })

  it('counts rooms by whether they are shared', async () => {
    await seedRoom(1, { shared: true })
    await seedRoom(1, { shared: true })
    await seedRoom(1)

    const body = await scrape()

    expect(sample(body, 'sf_rooms_total', 'shared="true"')).toBe(2)
    expect(sample(body, 'sf_rooms_total', 'shared="false"')).toBe(1)
  })

  it('leaves deleted rooms out of every room gauge', async () => {
    await seedRoom(4)
    await seedRoom(7, { deletedAt: new Date() })

    const body = await scrape()

    expect(sample(body, 'sf_rooms_total', 'shared="false"')).toBe(1)
    expect(sample(body, 'sf_room_factories_total')).toBe(4)
  })

  it('sums factories across rooms, counting an empty room as nothing', async () => {
    await seedRoom(3)
    await seedRoom(5, { shared: true })
    await seedRoom(0)

    expect(sample(await scrape(), 'sf_room_factories_total')).toBe(8)
  })

  it('reports zero rather than nothing when there is no data at all', async () => {
    const body = await scrape()

    expect(sample(body, 'sf_rooms_total', 'shared="true"')).toBe(0)
    expect(sample(body, 'sf_rooms_total', 'shared="false"')).toBe(0)
    expect(sample(body, 'sf_room_factories_total')).toBe(0)
    expect(sample(body, 'sf_users_total')).toBe(0)
  })

  it('counts membership rows and registered accounts', async () => {
    const room = await seedRoom(0)
    await memberships().create({ userId: 'a', roomId: room.roomId, role: 'owner' })
    await memberships().create({ userId: 'b', roomId: room.roomId, role: 'member' })
    await users().create({ username: 'one', password: 'hashed' })
    await users().create({ username: 'two', password: 'hashed' })
    await users().create({ username: 'three', password: 'hashed' })

    const body = await scrape()

    expect(sample(body, 'sf_room_members_total')).toBe(2)
    expect(sample(body, 'sf_users_total')).toBe(3)
  })

  it('reports no live sockets when nothing has connected', async () => {
    expect(sample(await scrape(), 'sf_ws_connections')).toBe(0)
  })

  it('says the database was readable', async () => {
    expect(sample(await scrape(), 'sf_metrics_database_up')).toBe(1)
  })

  it('reuses the previous answer inside the cache window', async () => {
    await seedRoom(2)
    expect(sample(await scrape(), 'sf_room_factories_total')).toBe(2)

    await seedRoom(9)

    // No clock advance, so the cache still stands and the new room is not visible yet.
    const cached = await withToken(context)
    expect(sample(cached.text, 'sf_room_factories_total')).toBe(2)

    expect(sample(await scrape(), 'sf_room_factories_total')).toBe(11)
  })
})

describe('the /metrics rate limiter', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
    useMetricsToken()
  })

  afterAll(async () => {
    await destroyTestApp(context)
    clearMetricsToken()
  })

  it('has room for the fastest scrape interval anyone would configure', () => {
    const scrapesPerWindow = METRICS_THROTTLE.ttl / 15_000

    expect(METRICS_THROTTLE.limit).toBeGreaterThan(scrapesPerWindow)
  })

  it(`allows ${METRICS_THROTTLE.limit} a minute in its own bucket, and never spends the global one`, async () => {
    for (let attempt = 0; attempt < METRICS_THROTTLE.limit; attempt++) {
      expect((await withToken(context)).status).toBe(200)
    }

    expect((await withToken(context)).status).toBe(429)

    // An exhausted scraper must not be able to rate-limit the planner.
    const login = await request(context.app.getHttpServer())
      .post('/login')
      .set('X-App-Version', '7.0')
      .send({ username: 'nobody', password: 'nobody' })
    expect(login.status).toBe(400)
  })
})

describe('GET /metrics when the database is unreachable', () => {
  let context: TestContext
  const clock = new FakeClock()

  afterEach(async () => {
    await destroyTestApp(context)
    clearMetricsToken()
  })

  it('serves what it can, and says the database is down', async () => {
    context = await createTestApp({ clock, unthrottled: true })
    const connection = await awaitConnection(context.app)
    useMetricsToken()

    expect(sample((await withToken(context)).text, 'sf_metrics_database_up')).toBe(1)

    await connection.close()
    clock.advance(METRICS_CACHE_MS + 1)

    const response = await withToken(context)

    // A 500 would cost Prometheus every series on the endpoint, the client ones included.
    expect(response.status).toBe(200)
    expect(sample(response.text, 'sf_metrics_database_up')).toBe(0)
    expect(sample(response.text, 'sf_active_clients', 'signed_in="false"')).toBe(0)
  })
})
