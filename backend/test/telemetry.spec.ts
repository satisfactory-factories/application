import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TELEMETRY_CAPS, TELEMETRY_VERSION_FALLBACK } from 'common'
import request from 'supertest'

import { METRICS_VERSION_LABEL_LIMIT, TELEMETRY_MIN_INTERVAL_MS } from '../src/metrics/metrics.constants'
import { TELEMETRY_THROTTLE } from '../src/config/throttling'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { FakeClock } from './utils/rooms'
import { clearMetricsToken, labelValues, sample, scrapeMetrics, useMetricsToken } from './utils/metrics'

const heartbeat = (overrides: Record<string, unknown> = {}) => ({
  instanceId: randomUUID(),
  signedIn: false,
  tabCount: 2,
  localTabCount: 1,
  cloudTabCount: 1,
  factoriesTotal: 6,
  appVersion: '0.7.0',
  ...overrides,
})

describe('POST /telemetry', () => {
  let context: TestContext
  const clock = new FakeClock()

  const post = (body: unknown) =>
    request(context.app.getHttpServer()).post('/telemetry').send(body as object)

  const scrape = async (): Promise<string> => {
    const response = await scrapeMetrics(context.app)
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

  beforeEach(() => {
    // Forward only, and far enough that every instance from the previous case has expired.
    clock.advance(TELEMETRY_CAPS.activeWindowMs + 1)
  })

  describe('what it accepts', () => {
    it('takes a well-formed heartbeat with no credentials at all', async () => {
      const response = await post(heartbeat())

      expect(response.status).toBe(204)
      expect(response.text).toBe('')
    })

    // The clients most worth counting are the ones the gate would otherwise turn away.
    it('is exempt from the version gate', async () => {
      const response = await post(heartbeat()).set('X-App-Version', 'ancient')

      expect(response.status).toBe(204)
    })

    it('does not mind a missing version header either', async () => {
      expect((await post(heartbeat())).status).toBe(204)
    })
  })

  describe('what it refuses', () => {
    it.each([
      ['a username', { username: 'mael' }],
      ['an account id', { userId: '651f2a9c' }],
      ['an email', { email: 'someone@example.com' }],
      ['plan names', { planNames: ['Steel'] }],
      ['a room id', { roomId: randomUUID() }],
      ['anything at all it was not asked for', { extra: 1 }],
    ])('400s on a payload carrying %s', async (_label, extra) => {
      const response = await post(heartbeat(extra))

      expect(response.status).toBe(400)
    })

    it.each([
      ['a non-UUID instance id', { instanceId: 'instance-one' }],
      ['a negative count', { tabCount: -1 }],
      ['a fractional count', { factoriesTotal: 2.5 }],
      ['a count past the cap', { localTabCount: TELEMETRY_CAPS.count + 1 }],
      ['a missing flag', { signedIn: undefined }],
      ['a version of the wrong type', { appVersion: 7 }],
    ])('400s on %s', async (_label, overrides) => {
      const body = heartbeat(overrides)
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete (body as Record<string, unknown>)[key]
      }

      expect((await post(body)).status).toBe(400)
    })

    it('400s on a body that is not an object', async () => {
      expect((await post('0.7.0')).status).toBe(400)
      expect((await post([heartbeat()])).status).toBe(400)
    })

    it('413s on a body past the size cap, before it is ever parsed', async () => {
      const oversized = heartbeat({ padding: 'x'.repeat(TELEMETRY_CAPS.bodyBytes) })

      const response = await post(oversized)

      // 413 rather than the 400 the unknown `padding` key would earn: the size check runs
      // first, so a huge body is refused without being walked.
      expect(response.status).toBe(413)
    })

    it('accepts a body just under the cap', async () => {
      const version = '1.0.0'
      const body = heartbeat({ appVersion: version })
      expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(TELEMETRY_CAPS.bodyBytes)

      expect((await post(body)).status).toBe(204)
    })
  })

  describe('the per-instance rate limit', () => {
    it('refuses a second heartbeat from the same instance too soon after the first', async () => {
      const instanceId = randomUUID()

      expect((await post(heartbeat({ instanceId }))).status).toBe(204)
      expect((await post(heartbeat({ instanceId }))).status).toBe(429)
    })

    it('lets the same instance back in once the floor has passed', async () => {
      const instanceId = randomUUID()
      await post(heartbeat({ instanceId }))

      clock.advance(TELEMETRY_MIN_INTERVAL_MS)

      expect((await post(heartbeat({ instanceId }))).status).toBe(204)
    })

    it('does not hold one instance against another', async () => {
      expect((await post(heartbeat())).status).toBe(204)
      expect((await post(heartbeat())).status).toBe(204)
    })

    it('leaves room for the whole client cadence in its own address bucket', () => {
      // A browser sends one every 5 minutes, so this is how many can share an address.
      const clientsPerAddress = TELEMETRY_THROTTLE.limit *
        (TELEMETRY_CAPS.intervalMs / TELEMETRY_THROTTLE.ttl)

      expect(clientsPerAddress).toBeGreaterThanOrEqual(200)
    })
  })

  describe('what it makes visible', () => {
    it('counts an active client, and which side of signed-in it is on', async () => {
      await post(heartbeat({ signedIn: true }))
      await post(heartbeat({ signedIn: true }))
      await post(heartbeat({ signedIn: false }))

      const body = await scrape()

      expect(sample(body, 'sf_active_clients', 'signed_in="true"')).toBe(2)
      expect(sample(body, 'sf_active_clients', 'signed_in="false"')).toBe(1)
    })

    it('sums tabs by kind and factories across every active client', async () => {
      await post(heartbeat({ localTabCount: 3, cloudTabCount: 1, factoriesTotal: 12 }))
      await post(heartbeat({ localTabCount: 2, cloudTabCount: 4, factoriesTotal: 30 }))

      const body = await scrape()

      expect(sample(body, 'sf_client_tabs', 'kind="local"')).toBe(5)
      expect(sample(body, 'sf_client_tabs', 'kind="cloud"')).toBe(5)
      expect(sample(body, 'sf_client_factories_total')).toBe(42)
    })

    it('counts the latest heartbeat from an instance, not both of them', async () => {
      const instanceId = randomUUID()
      await post(heartbeat({ instanceId, factoriesTotal: 10 }))
      clock.advance(TELEMETRY_MIN_INTERVAL_MS)
      await post(heartbeat({ instanceId, factoriesTotal: 25 }))

      const body = await scrape()

      expect(sample(body, 'sf_active_clients', 'signed_in="false"')).toBe(1)
      expect(sample(body, 'sf_client_factories_total')).toBe(25)
    })

    it('groups clients by the version they are running', async () => {
      await post(heartbeat({ appVersion: '0.7.0' }))
      await post(heartbeat({ appVersion: '0.7.0' }))
      await post(heartbeat({ appVersion: '0.6.1' }))

      const body = await scrape()

      expect(sample(body, 'sf_clients_by_version', 'version="0.7.0"')).toBe(2)
      expect(sample(body, 'sf_clients_by_version', 'version="0.6.1"')).toBe(1)
    })
  })

  describe('expiry', () => {
    it('drops an instance that has gone quiet for the whole window', async () => {
      await post(heartbeat({ localTabCount: 4, factoriesTotal: 9 }))
      expect(sample(await scrape(), 'sf_active_clients', 'signed_in="false"')).toBe(1)

      clock.advance(TELEMETRY_CAPS.activeWindowMs)

      const body = await scrape()
      expect(sample(body, 'sf_active_clients', 'signed_in="false"')).toBe(0)
      expect(sample(body, 'sf_client_tabs', 'kind="local"')).toBe(0)
      expect(sample(body, 'sf_client_factories_total')).toBe(0)
    })

    it('keeps an instance that is still inside the window', async () => {
      await post(heartbeat())

      clock.advance(TELEMETRY_CAPS.activeWindowMs - 1)

      expect(sample(await scrape(), 'sf_active_clients', 'signed_in="false"')).toBe(1)
    })

    it('stops reporting a version once the last client running it has gone', async () => {
      await post(heartbeat({ appVersion: '0.5.9' }))
      expect(sample(await scrape(), 'sf_clients_by_version', 'version="0.5.9"')).toBe(1)

      clock.advance(TELEMETRY_CAPS.activeWindowMs)

      // The series must disappear, not sit at its last value forever.
      expect(sample(await scrape(), 'sf_clients_by_version', 'version="0.5.9"')).toBeUndefined()
    })
  })

  describe('the census survives a restart', () => {
    // The whole reason this moved out of memory. The API redeploys often enough that losing
    // the census on every deploy was the thing people actually noticed.
    it('still counts a browser after the process is replaced', async () => {
      const instanceId = randomUUID()
      await post(heartbeat({ instanceId, localTabCount: 3, factoriesTotal: 21 }))
      expect(sample(await scrape(), 'sf_active_clients', 'signed_in="false"')).toBe(1)

      // A second app on the same database is what a redeploy looks like from Mongo's side.
      const restarted = await createTestApp({ clock, unthrottled: true })
      try {
        const response = await scrapeMetrics(restarted.app)
        expect(response.status).toBe(200)
        expect(sample(response.text, 'sf_active_clients', 'signed_in="false"')).toBe(1)
        expect(sample(response.text, 'sf_client_tabs', 'kind="local"')).toBe(3)
        expect(sample(response.text, 'sf_client_factories_total')).toBe(21)
      } finally {
        await destroyTestApp(restarted)
      }
    })
  })

  describe('the commit label', () => {
    it('groups browsers by the commit they were built from', async () => {
      await post(heartbeat({ gitSha: 'a1b2c3d4e5f6' }))
      await post(heartbeat({ gitSha: 'a1b2c3d4e5f6' }))
      await post(heartbeat({ gitSha: 'ffffffffffff' }))

      const body = await scrape()

      expect(sample(body, 'sf_clients_by_sha', 'sha="a1b2c3d4e5f6"')).toBe(2)
      expect(sample(body, 'sf_clients_by_sha', 'sha="ffffffffffff"')).toBe(1)
    })

    // Optional so a tab loaded before the field existed keeps reporting rather than being
    // rejected by the strict object.
    it('counts a heartbeat with no commit under unknown', async () => {
      expect((await post(heartbeat())).status).toBe(204)

      expect(sample(await scrape(), 'sf_clients_by_sha', 'sha="unknown"')).toBe(1)
    })

    it.each(['main', 'NOTHEX', '../etc', 'abc'])('buckets %s as unknown rather than labelling it', async sha => {
      await post(heartbeat({ gitSha: sha }))

      const body = await scrape()
      expect(sample(body, 'sf_clients_by_sha', 'sha="unknown"')).toBe(1)
      expect(sample(body, 'sf_clients_by_sha', `sha="${sha}"`)).toBeUndefined()
    })

    it('rejects a commit string past the cap', async () => {
      expect((await post(heartbeat({ gitSha: 'a'.repeat(41) }))).status).toBe(400)
    })
  })

  describe('the cardinality cap', () => {
    it('buckets a version the pattern does not recognise', async () => {
      await post(heartbeat({ appVersion: 'main' }))
      await post(heartbeat({ appVersion: 'dev-build' }))

      const body = await scrape()

      expect(sample(body, 'sf_clients_by_version', `version="${TELEMETRY_VERSION_FALLBACK}"`)).toBe(2)
      expect(sample(body, 'sf_clients_by_version', 'version="main"')).toBeUndefined()
    })

    it('never mints more series than the cap, however many versions arrive', async () => {
      const versions = METRICS_VERSION_LABEL_LIMIT + 12
      for (let index = 0; index < versions; index++) {
        expect((await post(heartbeat({ appVersion: `1.0.${index}` }))).status).toBe(204)
      }

      const body = await scrape()
      const labels = labelValues(body, 'sf_clients_by_version', 'version')

      expect(labels.length).toBe(METRICS_VERSION_LABEL_LIMIT + 1)
      expect(labels).toContain(TELEMETRY_VERSION_FALLBACK)
      // Nothing is lost, only relabelled: the tail is counted under `other`.
      expect(sample(body, 'sf_clients_by_version', `version="${TELEMETRY_VERSION_FALLBACK}"`))
        .toBe(versions - METRICS_VERSION_LABEL_LIMIT)
    })
  })
})

describe('the /telemetry rate limiter', () => {
  let context: TestContext

  beforeAll(async () => {
    context = await createTestApp()
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  it(`allows ${TELEMETRY_THROTTLE.limit} a minute per address, and never spends the global bucket`, async () => {
    for (let attempt = 0; attempt < TELEMETRY_THROTTLE.limit; attempt++) {
      const response = await request(context.app.getHttpServer())
        .post('/telemetry')
        .send(heartbeat())
      expect(response.status).toBe(204)
    }

    const throttled = await request(context.app.getHttpServer())
      .post('/telemetry')
      .send(heartbeat())
    expect(throttled.status).toBe(429)

    // A busy NAT heartbeating must never rate-limit the planner behind it.
    const login = await request(context.app.getHttpServer())
      .post('/login')
      .set('X-App-Version', '7.0')
      .send({ username: 'nobody', password: 'nobody' })
    expect(login.status).toBe(400)
  })
})
