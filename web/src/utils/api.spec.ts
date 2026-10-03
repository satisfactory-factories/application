import { describe, expect, it, vi } from 'vitest'
import {
  apiHeaders,
  checkResponseForOutdatedClient,
  CLIENT_OUTDATED_HEADER,
  CLIENT_VERSION_HEADER,
  clientTooOldError,
  isClientTooOldResponse,
} from '@/utils/api'
import { PROTOCOL_VERSION } from 'common'
import { config } from '@/config/config'
import eventBus from '@/utils/eventBus'

// Deliberately not mocked: this is the check that the build-time version actually reaches the
// app. A broken Vite wiring would otherwise only show up in production, as a header of
// "undefined" that the API refuses.
describe('the build version', () => {
  it('is a real version, stamped in at build time', () => {
    expect(config.appVersion).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('apiHeaders', () => {
  // The protocol version, not the release version: it is what the API's gate compares and the
  // only version header its CORS allowlist lets through.
  it('sends the client version on every request', () => {
    expect(apiHeaders()[CLIENT_VERSION_HEADER]).toBe(PROTOCOL_VERSION)
  })

  it('adds the Authorization header when a token is given', () => {
    expect(apiHeaders('abc').Authorization).toBe('Bearer abc')
  })

  // ShareButton sends an empty token for anonymous shares, which the API treats as anonymous
  // rather than as missing.
  it('keeps an empty token as an empty bearer', () => {
    expect(apiHeaders('').Authorization).toBe('Bearer ')
  })

  it('omits Authorization entirely when no token is given', () => {
    expect(apiHeaders()).not.toHaveProperty('Authorization')
  })
})

describe('isClientTooOldResponse', () => {
  it('recognises the status', () => {
    expect(isClientTooOldResponse({ status: 426 } as Response)).toBe(true)
  })

  it('recognises the body code whatever the status', () => {
    expect(isClientTooOldResponse({ status: 400 } as Response, { code: 'CLIENT_TOO_OLD' })).toBe(true)
  })

  it('leaves other failures alone', () => {
    expect(isClientTooOldResponse({ status: 500 } as Response, { code: 'SOMETHING_ELSE' })).toBe(false)
    expect(isClientTooOldResponse({ status: 401 } as Response)).toBe(false)
  })
})

describe('clientTooOldError', () => {
  it('takes the minimum from the body', () => {
    const error = clientTooOldError({ status: 426 } as Response, { minimumVersion: '0.7.0' })
    expect(error.minimumVersion).toBe('0.7.0')
  })

  it('falls back to unknown when the server said nothing useful', () => {
    expect(clientTooOldError({ status: 426 } as Response).minimumVersion).toBe('unknown')
  })
})

describe('checkResponseForOutdatedClient', () => {
  const responseWith = (header: string | null) => ({
    headers: { get: (name: string) => name === CLIENT_OUTDATED_HEADER ? header : null },
  }) as unknown as Response

  it('announces an outdated client', () => {
    const emit = vi.spyOn(eventBus, 'emit').mockClear()
    expect(checkResponseForOutdatedClient(responseWith('0.7.0'))).toBe(true)
    expect(emit).toHaveBeenCalledWith('clientOutdated', { minimumVersion: '0.7.0' })
  })

  it('says nothing when the header is absent', () => {
    const emit = vi.spyOn(eventBus, 'emit').mockClear()
    expect(checkResponseForOutdatedClient(responseWith(null))).toBe(false)
    expect(emit).not.toHaveBeenCalledWith('clientOutdated', expect.anything())
  })

  // Mocked responses and proxy error pages don't always have headers at all.
  it('survives a response with no headers', () => {
    expect(checkResponseForOutdatedClient({} as Response)).toBe(false)
  })
})
