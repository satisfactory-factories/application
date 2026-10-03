import { describe, expect, it } from 'vitest'

import { isLoopbackAddress, isLoopbackRequest } from './loopback'

describe('isLoopbackAddress', () => {
  it.each([
    '127.0.0.1',
    // Node reports the container's own probe in this form, which is what a real healthcheck sends.
    '::ffff:127.0.0.1',
    '::FFFF:127.0.0.1',
    '::1',
    // The whole of 127.0.0.0/8 is loopback, not just the one address.
    '127.0.0.2',
    '127.1.2.3',
    '127.255.255.254',
    '::ffff:127.10.20.30',
  ])('treats %s as loopback', address => {
    expect(isLoopbackAddress(address)).toBe(true)
  })

  it.each([
    '172.17.0.1',
    '10.0.0.1',
    '192.0.2.10',
    '128.0.0.1',
    '126.255.255.255',
    '2a00:1450:4009:81f::200e',
    '::ffff:172.17.0.1',
    '',
    'not-an-address',
  ])('does not treat %s as loopback', address => {
    expect(isLoopbackAddress(address)).toBe(false)
  })

  it('rejects an octet out of range rather than reading it as 127-something', () => {
    expect(isLoopbackAddress('127.0.0.999')).toBe(false)
  })

  it('strips a zone index rather than failing on an unexpected form', () => {
    expect(isLoopbackAddress('::1%lo0')).toBe(true)
  })
})

describe('isLoopbackRequest', () => {
  it('reads the socket peer', () => {
    expect(isLoopbackRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' } })).toBe(true)
    expect(isLoopbackRequest({ socket: { remoteAddress: '172.17.0.1' } })).toBe(false)
  })

  it('is false when there is no peer to read', () => {
    expect(isLoopbackRequest({ socket: { remoteAddress: undefined } })).toBe(false)
    expect(isLoopbackRequest({ socket: null })).toBe(false)
    expect(isLoopbackRequest({})).toBe(false)
    expect(isLoopbackRequest(null)).toBe(false)
    expect(isLoopbackRequest(undefined)).toBe(false)
  })
})
