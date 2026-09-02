import { describe, expect, it } from 'vitest'
import type { ExecutionContext } from '@nestjs/common'

import {
  GLOBAL_THROTTLE,
  HEALTH_THROTTLE,
  METRICS_THROTTLE,
  ROOM_AUTH_THROTTLE,
  SHARE_THROTTLE,
  TELEMETRY_THROTTLE,
  THROTTLER_OPTIONS,
  VERSION_THROTTLE,
} from '../src/config/throttling'
import { REQUIRED_ENV_VARS, validateEnv } from '../src/config/env'

describe('validateEnv', () => {
  const valid = { JWT_SECRET: 's', MONGODB_URI: 'mongodb://localhost:27017/x' }

  it('lists JWT_SECRET among the variables boot refuses to start without', () => {
    expect(REQUIRED_ENV_VARS).toContain('JWT_SECRET')
    expect(REQUIRED_ENV_VARS).toContain('MONGODB_URI')
  })

  it('passes a complete environment through untouched', () => {
    expect(validateEnv({ ...valid, EXTRA: '1' })).toMatchObject(valid)
  })

  it.each(REQUIRED_ENV_VARS)('throws when %s is missing', key => {
    const incomplete = { ...valid, [key]: undefined }
    expect(() => validateEnv(incomplete)).toThrowError(new RegExp(key))
  })

  it('treats a blank value as missing, so JWT_SECRET= is not a secret', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: '   ' })).toThrowError(/JWT_SECRET/)
  })
})

describe('throttler configuration', () => {
  const options = THROTTLER_OPTIONS as Extract<typeof THROTTLER_OPTIONS, { throttlers: unknown }>

  const context = (method: string, path: string): ExecutionContext => ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ method, path }) }),
  }) as unknown as ExecutionContext

  const applies = (name: string, method: string, path: string): boolean => {
    const throttler = options.throttlers.find(entry => entry.name === name)
    return throttler?.skipIf?.(context(method, path)) === false
  }

  it('keeps the express-rate-limit buckets: 200 per 5 minutes, 10 on health, 30 on version', () => {
    expect(GLOBAL_THROTTLE).toEqual({ name: 'global', ttl: 300_000, limit: 200 })
    expect(HEALTH_THROTTLE).toEqual({ name: 'health', ttl: 60_000, limit: 10 })
    expect(VERSION_THROTTLE).toEqual({ name: 'version', ttl: 60_000, limit: 30 })
  })

  it('keeps share creation at 5 per 5 minutes and holds the password exchange to 10', () => {
    expect(SHARE_THROTTLE).toEqual({ name: 'share', ttl: 300_000, limit: 5 })
    expect(ROOM_AUTH_THROTTLE).toEqual({ name: 'roomAuth', ttl: 300_000, limit: 10 })
  })

  it('gives the scrape target and the heartbeat buckets of their own', () => {
    expect(METRICS_THROTTLE).toEqual({ name: 'metrics', ttl: 60_000, limit: 30 })
    expect(TELEMETRY_THROTTLE).toEqual({ name: 'telemetry', ttl: 60_000, limit: 60 })
  })

  it('keys on the client alone, so routes share one allowance rather than each getting 200', () => {
    expect(options.generateKey?.({} as never, '127.0.0.1', 'global')).toBe('global-127.0.0.1')
    expect(options.throttlers.map(throttler => throttler.name))
      .toEqual(['global', 'health', 'version', 'metrics', 'telemetry', 'share', 'roomAuth'])
    expect(options.throttlers.every(throttler => typeof throttler.skipIf === 'function')).toBe(true)
  })

  it('narrows each extra bucket to the one route it protects', () => {
    expect(applies('share', 'POST', '/share')).toBe(true)
    expect(applies('share', 'GET', '/share/some-link')).toBe(false)
    expect(applies('roomAuth', 'POST', '/rooms/abc-123/auth')).toBe(true)
    expect(applies('roomAuth', 'POST', '/rooms/abc-123/join')).toBe(false)
    // The narrow buckets stack on the global one rather than replacing it.
    expect(applies('global', 'POST', '/share')).toBe(true)
    expect(applies('global', 'POST', '/rooms/abc-123/auth')).toBe(true)
    expect(applies('global', 'GET', '/health')).toBe(false)
    // Polling for a release must not spend the allowance ordinary traffic needs, nor be
    // stopped by it: /version keeps its own bucket and sits outside the global one.
    expect(applies('version', 'GET', '/version')).toBe(true)
    expect(applies('version', 'GET', '/health')).toBe(false)
    expect(applies('global', 'GET', '/version')).toBe(false)
    // Both sides of the metrics pair sit outside the global bucket: a scrape or a
    // heartbeat storm must not rate-limit the planner, and traffic must not open a gap
    // in the graphs.
    expect(applies('metrics', 'GET', '/metrics')).toBe(true)
    expect(applies('metrics', 'POST', '/telemetry')).toBe(false)
    expect(applies('global', 'GET', '/metrics')).toBe(false)
    expect(applies('telemetry', 'POST', '/telemetry')).toBe(true)
    expect(applies('telemetry', 'GET', '/metrics')).toBe(false)
    expect(applies('global', 'POST', '/telemetry')).toBe(false)
  })
})
