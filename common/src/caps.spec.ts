import { describe, expect, it } from 'vitest'

import { CAPS } from './caps'
import { CLOSE_CODES, PROTOCOL_VERSION } from './types/protocol'

// Pinned deliberately: these numbers are the v7 plan's validation table, and both
// apps and the release notes quote them.
describe('CAPS', () => {
  it('matches the plan', () => {
    expect(CAPS).toMatchObject({
      name: 200,
      notes: 1000,
      taskTitle: 200,
      tasks: 50,
      slugMax: 100,
      passwordMin: 1,
      passwordMax: 100,
      groupColor: 32,
      factoriesPerRoom: 150,
      ownedRoomsPerUser: 10,
      membershipsPerUser: 25,
      string: 10000,
    })
  })

  it('has a slug pattern anchored at both ends', () => {
    expect(CAPS.slugPattern.source).toBe('^[a-z0-9-]{1,100}$')
  })
})

describe('protocol constants', () => {
  it('starts at 7.0', () => {
    expect(PROTOCOL_VERSION).toBe('7.0')
  })

  it('carries the three close codes the client branches on', () => {
    expect(CLOSE_CODES).toEqual({ unauthorized: 4401, forbidden: 4403, versionMismatch: 4426 })
  })
})
