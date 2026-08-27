import { describe, expect, it } from 'vitest'

import { GLOBAL_THROTTLE, HEALTH_THROTTLE, THROTTLER_OPTIONS } from '../src/config/throttling'
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
  it('keeps the express-rate-limit buckets: 200 per 5 minutes, 10 per minute on health', () => {
    expect(GLOBAL_THROTTLE).toEqual({ name: 'global', ttl: 300_000, limit: 200 })
    expect(HEALTH_THROTTLE).toEqual({ name: 'health', ttl: 60_000, limit: 10 })
  })

  it('keys on the client alone, so routes share one allowance rather than each getting 200', () => {
    const options = THROTTLER_OPTIONS as Extract<typeof THROTTLER_OPTIONS, { throttlers: unknown }>

    expect(options.generateKey?.({} as never, '127.0.0.1', 'global')).toBe('global-127.0.0.1')
    expect(options.throttlers.map(throttler => throttler.name)).toEqual(['global', 'health'])
    expect(options.throttlers.every(throttler => typeof throttler.skipIf === 'function')).toBe(true)
  })
})
