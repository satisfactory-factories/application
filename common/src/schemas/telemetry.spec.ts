import { describe, expect, it } from 'vitest'

import {
  TELEMETRY_CAPS,
  TELEMETRY_VERSION_LABEL_PATTERN,
  parseTelemetryHeartbeat,
  telemetryHeartbeatSchema,
} from './telemetry'

const INSTANCE_ID = '3f6c1b3a-9d0e-4a21-8f77-2b5c9e0a4d18'

const heartbeat = (overrides: Record<string, unknown> = {}) => ({
  instanceId: INSTANCE_ID,
  signedIn: false,
  tabCount: 3,
  localTabCount: 2,
  cloudTabCount: 1,
  factoriesTotal: 27,
  appVersion: '0.7.0',
  ...overrides,
})

/**
 * Written out rather than derived from the schema. Deriving it would make this test agree
 * with whatever the schema says, which is the one thing it must not do: the list is the
 * privacy promise in `docs/telemetry.md`, and changing the schema has to fail here first.
 */
const ALLOWED_FIELDS = [
  'instanceId',
  'signedIn',
  'tabCount',
  'localTabCount',
  'cloudTabCount',
  'factoriesTotal',
  'appVersion',
]

describe('telemetryHeartbeatSchema', () => {
  it('accepts a well-formed heartbeat', () => {
    const result = parseTelemetryHeartbeat(heartbeat())

    expect(result.success).toBe(true)
    expect(result.success && result.data).toEqual(heartbeat())
  })

  it('collects exactly these fields and no others', () => {
    expect(Object.keys(telemetryHeartbeatSchema.shape).sort()).toEqual([...ALLOWED_FIELDS].sort())
  })

  it.each([
    ['username', { username: 'mael' }],
    ['an account id', { userId: '651f2a...' }],
    ['an email', { email: 'someone@example.com' }],
    ['plan names', { planNames: ['Steel', 'Aluminium'] }],
    ['a room id', { roomId: INSTANCE_ID }],
  ])('rejects a payload carrying %s', (_label, extra) => {
    const result = parseTelemetryHeartbeat(heartbeat(extra))

    expect(result.success).toBe(false)
  })

  it('rejects an instance id that is not a UUID', () => {
    expect(parseTelemetryHeartbeat(heartbeat({ instanceId: 'instance-one' })).success).toBe(false)
    expect(parseTelemetryHeartbeat(heartbeat({ instanceId: '' })).success).toBe(false)
  })

  it.each(['tabCount', 'localTabCount', 'cloudTabCount', 'factoriesTotal'])(
    'rejects %s when it is negative, fractional or past the cap',
    field => {
      expect(parseTelemetryHeartbeat(heartbeat({ [field]: -1 })).success).toBe(false)
      expect(parseTelemetryHeartbeat(heartbeat({ [field]: 1.5 })).success).toBe(false)
      expect(parseTelemetryHeartbeat(heartbeat({ [field]: TELEMETRY_CAPS.count + 1 })).success).toBe(false)
      expect(parseTelemetryHeartbeat(heartbeat({ [field]: TELEMETRY_CAPS.count })).success).toBe(true)
    },
  )

  it('rejects a version string past the cap, and an empty one', () => {
    const tooLong = 'v'.repeat(TELEMETRY_CAPS.appVersion + 1)

    expect(parseTelemetryHeartbeat(heartbeat({ appVersion: tooLong })).success).toBe(false)
    expect(parseTelemetryHeartbeat(heartbeat({ appVersion: '' })).success).toBe(false)
  })

  it.each(['signedIn', 'tabCount', 'appVersion', 'instanceId'])('requires %s', field => {
    const body = heartbeat()
    delete (body as Record<string, unknown>)[field]

    expect(parseTelemetryHeartbeat(body).success).toBe(false)
  })

  it('rejects a non-object body', () => {
    expect(parseTelemetryHeartbeat(null).success).toBe(false)
    expect(parseTelemetryHeartbeat('0.7.0').success).toBe(false)
    expect(parseTelemetryHeartbeat([heartbeat()]).success).toBe(false)
  })
})

describe('TELEMETRY_VERSION_LABEL_PATTERN', () => {
  it.each(['0.7.0', '1.2.3', '0.7.0-beta.1', '10.20.30'])('allows %s as a label', version => {
    expect(TELEMETRY_VERSION_LABEL_PATTERN.test(version)).toBe(true)
  })

  it.each([
    'main',
    '0.7',
    '0.7.0.1',
    '../../etc/passwd',
    '0.7.0; DROP',
    '99999.0.0',
    'a'.repeat(40),
  ])('refuses %s, so it buckets as other', version => {
    expect(TELEMETRY_VERSION_LABEL_PATTERN.test(version)).toBe(false)
  })

  it('is anchored, so a valid version inside a longer string does not pass', () => {
    expect(TELEMETRY_VERSION_LABEL_PATTERN.test('x0.7.0')).toBe(false)
    expect(TELEMETRY_VERSION_LABEL_PATTERN.test('0.7.0x')).toBe(false)
    expect(TELEMETRY_VERSION_LABEL_PATTERN.test('0.7.0\nevil')).toBe(false)
  })

  // A newline in a label value would break the exposition format itself, and `$` is the
  // only thing standing between a client and one. It holds here because JavaScript's `$`
  // matches the true end of the string, unlike Perl's and Python's.
  it('refuses a trailing newline', () => {
    expect(TELEMETRY_VERSION_LABEL_PATTERN.test('0.7.0\n')).toBe(false)
    expect(TELEMETRY_VERSION_LABEL_PATTERN.test('0.7.0\r\n')).toBe(false)
  })
})
