import { describe, expect, it } from 'vitest'

import { ACCEPTED_VERSION_HEADERS, APP_VERSION_HEADER, APP_VERSION_HEADER_FALLBACK } from './protocol'

// Renaming the header a client sends is a breaking change dressed as a rename: a custom header
// forces a CORS preflight, so a server that does not allow the new name blocks the request in the
// browser before the version gate can answer 426. These pin the names so that stays deliberate.
describe('the version header names', () => {
  it('sends the name every client since the gate shipped has sent', () => {
    expect(APP_VERSION_HEADER).toBe('X-Planner-Version')
  })

  it('keeps accepting the name v0.7.x builds sent', () => {
    expect(APP_VERSION_HEADER_FALLBACK).toBe('X-App-Version')
  })

  it('lists both names for CORS and the gate, primary first', () => {
    expect([...ACCEPTED_VERSION_HEADERS]).toEqual([APP_VERSION_HEADER, APP_VERSION_HEADER_FALLBACK])
  })
})
