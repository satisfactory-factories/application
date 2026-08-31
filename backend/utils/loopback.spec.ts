import { describe, expect, it } from 'vitest';

import { isLoopbackRequest } from './loopback';

describe('isLoopbackRequest', () => {
  it.each([
    ['127.0.0.1'],
    ['::1'],
    ['::ffff:127.0.0.1'],
    ['::FFFF:127.0.0.1']
  ])('treats %s as loopback', (address) => {
    expect(isLoopbackRequest({ socket: { remoteAddress: address } })).toBe(true);
  });

  it.each([
    ['172.18.0.4'],
    ['10.0.0.1'],
    ['1.2.3.4'],
    ['127.0.0.2'],
    ['2a00:1450:4009:81f::200e']
  ])('does not treat %s as loopback', (address) => {
    expect(isLoopbackRequest({ socket: { remoteAddress: address } })).toBe(false);
  });

  it('is false when the socket has no address', () => {
    expect(isLoopbackRequest({ socket: { remoteAddress: undefined } })).toBe(false);
    expect(isLoopbackRequest({ socket: null })).toBe(false);
    expect(isLoopbackRequest({})).toBe(false);
  });

  it('strips a zone index rather than failing on an unexpected form', () => {
    expect(isLoopbackRequest({ socket: { remoteAddress: '::1%lo0' } })).toBe(true);
  });
});
