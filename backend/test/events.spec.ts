import { randomUUID } from 'node:crypto'

import { EVENT_CAPS, EVENT_REASONS } from 'common'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'

import { EVENTS_THROTTLE } from '../src/config/throttling'
import { TELEMETRY_MIN_INTERVAL_MS } from '../src/metrics/metrics.constants'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { FakeClock, resetRooms } from './utils/rooms'
import { clearMetricsToken, sample, scrapeMetrics, useMetricsToken } from './utils/metrics'

const report = (overrides: Record<string, unknown> = {}) => ({
  instanceId: randomUUID(),
  appVersion: '0.7.0',
  events: [{ reason: 'plan_repair_duplicate_factory_id', count: 1 }],
  ...overrides,
})

describe('POST /events', () => {
  let context: TestContext
  const clock = new FakeClock()

  const post = (body: unknown) =>
    request(context.app.getHttpServer()).post('/events').send(body as object)

  const scrape = async (): Promise<string> => {
    const response = await scrapeMetrics(context.app)
    expect(response.status).toBe(200)
    return response.text
  }

  const events = (body: string, reason: string, source = 'client') =>
    sample(body, 'sf_events_total', `source="${source}",reason="${reason}"`)

  beforeAll(async () => {
    context = await createTestApp({ clock, unthrottled: true })
    await awaitConnection(context.app)
    useMetricsToken()
  })

  afterAll(async () => {
    await destroyTestApp(context)
    clearMetricsToken()
  })

  beforeEach(async () => {
    await resetRooms(context.app)
    // Forward only, and past the per-instance floor left by the previous case.
    clock.advance(TELEMETRY_MIN_INTERVAL_MS + 1)
  })

  describe('what it accepts', () => {
    it('takes a batch with no credentials at all', async () => {
      const response = await post(report())

      expect(response.status).toBe(204)
      expect(response.text).toBe('')
    })

    // The clients most worth hearing from are the broken and the out-of-date ones.
    it('is exempt from the version gate', async () => {
      expect((await post(report())).status).toBe(204)
    })

    it('counts by the reported count, not once per request', async () => {
      await post(report({ events: [{ reason: 'plan_repair_export_orphaned', count: 7 }] }))

      expect(events(await scrape(), 'plan_repair_export_orphaned')).toBe(7)
    })

    it('accepts several reasons in one batch', async () => {
      await post(report({
        events: [
          { reason: 'plan_repair_import_orphaned', count: 2 },
          { reason: 'calc_dependency_corrupt_alert', count: 1 },
        ],
      }))

      const body = await scrape()
      expect(events(body, 'plan_repair_import_orphaned')).toBe(2)
      expect(events(body, 'calc_dependency_corrupt_alert')).toBe(1)
    })

    it('accumulates across batches rather than replacing', async () => {
      await post(report({ events: [{ reason: 'api_network_error', count: 3 }] }))
      clock.advance(TELEMETRY_MIN_INTERVAL_MS + 1)
      await post(report({ events: [{ reason: 'api_network_error', count: 4 }] }))

      expect(events(await scrape(), 'api_network_error')).toBe(7)
    })

    // A reason that has never fired must read as a green zero, not as an absent series that
    // a panel renders as "No data".
    it('exports every reason at zero before anything happens', async () => {
      const body = await scrape()

      for (const reason of EVENT_REASONS) {
        expect(events(body, reason)).not.toBeUndefined()
      }
    })
  })

  describe('what it refuses', () => {
    // The whole cardinality design: a client cannot invent a label.
    it.each(['not_a_reason', 'plan_repair_made_up', '../../etc', ''])(
      'rejects the unknown reason %s', async reason => {
        expect((await post(report({ events: [{ reason, count: 1 }] }))).status).toBe(400)
      })

    it('rejects an unknown top-level field', async () => {
      expect((await post(report({ message: 'stack trace here' }))).status).toBe(400)
    })

    it('rejects a count past the cap, and a non-positive one', async () => {
      expect((await post(report({ events: [{ reason: 'api_network_error', count: EVENT_CAPS.count + 1 }] }))).status).toBe(400)
      expect((await post(report({ events: [{ reason: 'api_network_error', count: 0 }] }))).status).toBe(400)
    })

    it('rejects an empty batch', async () => {
      expect((await post(report({ events: [] }))).status).toBe(400)
    })

    it('rejects a non-UUID instance id', async () => {
      expect((await post(report({ instanceId: 'browser-one' }))).status).toBe(400)
    })

    // Comfortably past the byte cap, so the size check fires before the schema gets a look.
    // A 413 rather than a 400 is what proves the ordering.
    it('413s on a body past the size cap', async () => {
      const padded = report({ appVersion: 'v'.repeat(EVENT_CAPS.bodyBytes + 1000) })

      expect((await post(padded)).status).toBe(413)
    })

    it('does not count anything from a refused batch', async () => {
      // Counters accumulate for the life of the app, so the assertion is on the delta.
      const before = events(await scrape(), 'plan_repair_duplicate_factory_id') ?? 0

      await post(report({ events: [
        { reason: 'plan_repair_duplicate_factory_id', count: 5 },
        { reason: 'made_up', count: 5 },
      ] }))

      // The whole batch is refused, so the valid entry beside the bad one is not counted.
      expect(events(await scrape(), 'plan_repair_duplicate_factory_id')).toBe(before)
    })
  })

  describe('the per-instance floor', () => {
    it('refuses a second batch from the same instance too soon', async () => {
      const instanceId = randomUUID()

      expect((await post(report({ instanceId }))).status).toBe(204)
      expect((await post(report({ instanceId }))).status).toBe(429)
    })

    it('lets it back in once the floor has passed', async () => {
      const instanceId = randomUUID()
      await post(report({ instanceId }))

      clock.advance(TELEMETRY_MIN_INTERVAL_MS)

      expect((await post(report({ instanceId }))).status).toBe(204)
    })

    it('does not hold one instance against another', async () => {
      expect((await post(report())).status).toBe(204)
      expect((await post(report())).status).toBe(204)
    })

    // The floor is on its own timestamp, so reporting a fault must not cost the browser its
    // heartbeat or the other way round.
    it('does not spend the heartbeat allowance', async () => {
      const instanceId = randomUUID()
      await post(report({ instanceId }))

      const heartbeat = await request(context.app.getHttpServer()).post('/telemetry').send({
        instanceId,
        signedIn: false,
        tabCount: 1,
        localTabCount: 1,
        cloudTabCount: 0,
        factoriesTotal: 2,
        appVersion: '0.7.0',
      })

      expect(heartbeat.status).toBe(204)
    })

    it('accepts a report from an instance that has never heartbeated', async () => {
      expect((await post(report({ instanceId: randomUUID() }))).status).toBe(204)
    })
  })
})

describe('the /events rate limiter', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  it(`allows ${EVENTS_THROTTLE.limit} a minute per address, and never spends the global bucket`, async () => {
    const send = () =>
      request(context.app.getHttpServer()).post('/events').send(report())

    // Each batch carries a fresh instance id, so the per-instance floor never fires and the
    // address bucket is the only thing being measured.
    for (let attempt = 0; attempt < EVENTS_THROTTLE.limit; attempt++) {
      expect((await send()).status).toBe(204)
    }

    expect((await send()).status).toBe(429)

    // A browser in an error loop must never rate-limit the planner beside it.
    const login = await request(context.app.getHttpServer())
      .post('/login')
      .set('X-App-Version', '7.0')
      .send({ username: 'nobody', password: 'nobody' })
    expect(login.status).toBe(400)
  })
})

describe('the HTTP error filter', () => {
  let context: TestContext

  const scrape = async (): Promise<string> => {
    const response = await scrapeMetrics(context.app)
    expect(response.status).toBe(200)
    return response.text
  }

  const httpErrors = (body: string, status: number) =>
    sample(body, 'sf_http_errors_total', `status="${status}"`)

  beforeAll(async () => {
    context = await createTestApp({ unthrottled: true })
    await awaitConnection(context.app)
    useMetricsToken()
  })

  afterAll(async () => {
    await destroyTestApp(context)
    clearMetricsToken()
  })

  it('counts a 4xx', async () => {
    const before = httpErrors(await scrape(), 400) ?? 0

    await request(context.app.getHttpServer())
      .post('/login')
      .set('X-App-Version', '7.0')
      .send({ username: 'nobody', password: 'nobody' })

    expect(httpErrors(await scrape(), 400)).toBe(before + 1)
  })

  it('counts a 426 from the version gate', async () => {
    const before = httpErrors(await scrape(), 426) ?? 0

    await request(context.app.getHttpServer()).get('/rooms').set('X-App-Version', 'ancient')

    expect(httpErrors(await scrape(), 426)).toBe(before + 1)
  })

  /**
   * The property Codex asked to be proven rather than assumed: `super.catch()` must leave the
   * response exactly as Nest would have. A status alone would not show a mangled body.
   */
  it('leaves a structured error body untouched', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/rooms')
      .set('X-App-Version', 'ancient')

    expect(response.status).toBe(426)
    expect(response.body).toMatchObject({
      code: 'version_mismatch',
      requiredVersion: expect.any(String),
    })
  })

  it('leaves a plain message body untouched', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/login')
      .set('X-App-Version', '7.0')
      .send({ username: 'nobody', password: 'nobody' })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Invalid credentials')
  })

  it('does not count a success', async () => {
    const before = httpErrors(await scrape(), 200) ?? 0

    await request(context.app.getHttpServer()).get('/health')

    expect(httpErrors(await scrape(), 200) ?? 0).toBe(before)
  })
})
