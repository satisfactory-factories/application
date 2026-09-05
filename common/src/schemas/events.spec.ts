import { describe, expect, it } from 'vitest'

import {
  EVENT_CAPS,
  EVENT_REASONS,
  EVENT_SOURCES,
  isEventReason,
  parseEventReport,
} from './events'

const INSTANCE_ID = '3f6c1b3a-9d0e-4a21-8f77-2b5c9e0a4d18'

const report = (overrides: Record<string, unknown> = {}) => ({
  instanceId: INSTANCE_ID,
  appVersion: '0.7.0',
  events: [{ reason: 'api_network_error', count: 2 }],
  ...overrides,
})

describe('eventReportSchema', () => {
  it('accepts a well-formed batch', () => {
    expect(parseEventReport(report()).success).toBe(true)
  })

  it('accepts a batch carrying the build commit', () => {
    expect(parseEventReport(report({ gitSha: 'a1b2c3d4e5f6' })).success).toBe(true)
  })

  it('accepts one entry per reason at once', () => {
    const events = EVENT_REASONS.map(reason => ({ reason, count: 1 }))

    expect(parseEventReport(report({ events })).success).toBe(true)
  })

  /**
   * The whole cardinality design. A reason becomes a Prometheus label, and the endpoint is
   * unauthenticated, so anything a caller can invent is a series that Prometheus keeps for
   * its whole retention.
   */
  it.each([
    'not_a_reason',
    'plan_repair_made_up',
    '../../etc/passwd',
    'api_network_error ',
    'API_NETWORK_ERROR',
    '',
  ])('rejects the invented reason %s', reason => {
    expect(parseEventReport(report({ events: [{ reason, count: 1 }] })).success).toBe(false)
  })

  it('rejects a message, a stack, or anything else it was not asked for', () => {
    expect(parseEventReport(report({ message: 'boom' })).success).toBe(false)
    expect(parseEventReport(report({ stack: 'at foo()' })).success).toBe(false)
    expect(parseEventReport(report({ planName: 'Steel' })).success).toBe(false)
  })

  it('rejects extra fields inside an entry', () => {
    const events = [{ reason: 'api_network_error', count: 1, detail: 'ECONNRESET' }]

    expect(parseEventReport(report({ events })).success).toBe(false)
  })

  it('rejects a count that is not a positive integer inside the cap', () => {
    for (const count of [0, -1, 1.5, EVENT_CAPS.count + 1]) {
      expect(parseEventReport(report({ events: [{ reason: 'api_network_error', count }] })).success)
        .toBe(false)
    }
    expect(parseEventReport(report({ events: [{ reason: 'api_network_error', count: EVENT_CAPS.count }] })).success)
      .toBe(true)
  })

  it('rejects an empty batch and one past the entry cap', () => {
    expect(parseEventReport(report({ events: [] })).success).toBe(false)

    const tooMany = Array.from(
      { length: EVENT_CAPS.entries + 1 },
      () => ({ reason: 'api_network_error', count: 1 }),
    )
    expect(parseEventReport(report({ events: tooMany })).success).toBe(false)
  })

  it('rejects an instance id that is not a UUID', () => {
    expect(parseEventReport(report({ instanceId: 'browser-one' })).success).toBe(false)
  })

  it('requires a version', () => {
    const body = report()
    delete (body as Record<string, unknown>).appVersion

    expect(parseEventReport(body).success).toBe(false)
  })
})

describe('the reason enum', () => {
  it('has no duplicates', () => {
    expect(new Set(EVENT_REASONS).size).toBe(EVENT_REASONS.length)
  })

  // Label values end up in queries and panel titles; anything else is asking for a quoting bug.
  it('is entirely lowercase, digits and underscores', () => {
    for (const reason of EVENT_REASONS) expect(reason).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('names exactly two sources', () => {
    expect([...EVENT_SOURCES]).toEqual(['client', 'server'])
  })

  it('recognises every member and nothing else', () => {
    for (const reason of EVENT_REASONS) expect(isEventReason(reason)).toBe(true)

    for (const invented of ['nope', '', null, undefined, 42, {}]) {
      expect(isEventReason(invented)).toBe(false)
    }
  })

  /**
   * `stale` and `duplicate` op rejections are the concurrency control working exactly as
   * designed, and happen constantly in ordinary two-person editing. Counting them would bury
   * everything else on the panel.
   */
  it('does not count a routine op rejection as a fault', () => {
    expect(isEventReason('sync_op_reject_stale')).toBe(false)
    expect(isEventReason('sync_op_reject_duplicate')).toBe(false)
    expect(isEventReason('sync_op_reject_forbidden')).toBe(true)
  })
})
