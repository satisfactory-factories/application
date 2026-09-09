import { describe, expect, it } from 'vitest'

import { CAPS } from '../caps'
import { makeFactory, makeFactoryTab } from '../testing/fixtures'
import { PROTOCOL_VERSION } from '../types/protocol'
import {
  clientMessageSchema,
  parseClientMessage,
  parseFactory,
  parseFactoryTab,
  roomDiffSchema,
} from './messages'

const helloMessage = { type: 'hello', protocolVersion: PROTOCOL_VERSION }
const opMessage = {
  type: 'op',
  roomId: 'room-1',
  opId: 'op-1',
  baseRevision: 12,
  diff: { factories: [makeFactory()] },
}

describe('clientMessageSchema', () => {
  it.each([
    helloMessage,
    { ...helloMessage, token: 'jwt' },
    { type: 'join', roomId: 'room-1' },
    { type: 'join', roomId: 'room-1', lastRevision: 4, visitorToken: 'vt' },
    opMessage,
    { type: 'leave', roomId: 'room-1' },
    { type: 'lock', roomId: 'room-1', fieldKey: 'notes:3' },
    { type: 'unlock', roomId: 'room-1', fieldKey: 'notes:3' },
  ])('accepts $type', message => {
    expect(clientMessageSchema.safeParse(message).success).toBe(true)
  })

  it('rejects an unknown message type', () => {
    expect(clientMessageSchema.safeParse({ type: 'nope', roomId: 'room-1' }).success).toBe(false)
  })

  it('rejects a server message type sent by a client', () => {
    expect(clientMessageSchema.safeParse({ type: 'snapshot', roomId: 'room-1' }).success).toBe(false)
  })

  it('rejects an op with no base revision', () => {
    const withoutBase: Record<string, unknown> = { ...opMessage }
    delete withoutBase.baseRevision
    expect(clientMessageSchema.safeParse(withoutBase).success).toBe(false)
  })

  it('rejects an empty roomId', () => {
    expect(clientMessageSchema.safeParse({ type: 'leave', roomId: '' }).success).toBe(false)
  })

  it.each(['', 'x'.repeat(CAPS.fieldKey + 1)])('rejects a field key of %o', fieldKey => {
    expect(clientMessageSchema.safeParse({ type: 'lock', roomId: 'room-1', fieldKey }).success)
      .toBe(false)
  })

  it('accepts a field key right on the cap', () => {
    const fieldKey = 'x'.repeat(CAPS.fieldKey)
    expect(clientMessageSchema.safeParse({ type: 'lock', roomId: 'room-1', fieldKey }).success)
      .toBe(true)
  })

  it('strips unknown keys off an accepted message', () => {
    const parsed = clientMessageSchema.parse({ ...helloMessage, injected: true })
    expect('injected' in parsed).toBe(false)
  })

  it('rejects an op carrying a malformed factory', () => {
    const message = { ...opMessage, diff: { factories: [{ id: 1 }] } }
    expect(clientMessageSchema.safeParse(message).success).toBe(false)
  })
})

describe('roomDiffSchema', () => {
  it('accepts an empty diff', () => {
    expect(roomDiffSchema.safeParse({}).success).toBe(true)
  })

  it('accepts removals', () => {
    expect(roomDiffSchema.safeParse({ removedFactoryIds: [1, 2, 3] }).success).toBe(true)
  })

  it('rejects more factories than the per-room cap', () => {
    const factories = Array.from({ length: CAPS.factoriesPerRoom + 1 }, (_, index) =>
      makeFactory({ id: index }))
    expect(roomDiffSchema.safeParse({ factories }).success).toBe(false)
  })
})

describe('the truncate-then-reject boundary', () => {
  it('truncates an over-long factory name instead of rejecting it', () => {
    const result = parseFactory(makeFactory({ name: 'x'.repeat(500) }))
    expect(result.success).toBe(true)
    expect(result.data?.name).toHaveLength(CAPS.name)
  })

  it('truncates through a tab', () => {
    const result = parseFactoryTab(makeFactoryTab({
      name: 'T'.repeat(400),
      factories: [makeFactory({ notes: 'n'.repeat(4000) })],
    }))
    expect(result.success).toBe(true)
    expect(result.data?.name).toHaveLength(CAPS.name)
    expect(result.data?.factories[0].notes).toHaveLength(CAPS.notes)
  })

  it('still rejects a cap that is not a truncation', () => {
    const factories = Array.from({ length: CAPS.factoriesPerRoom + 1 }, (_, index) =>
      makeFactory({ id: index }))
    expect(parseFactoryTab(makeFactoryTab({ factories })).success).toBe(false)
  })

  it('truncates the factories inside an op before validating it', () => {
    const message = {
      ...opMessage,
      diff: { name: 'T'.repeat(400), factories: [makeFactory({ name: 'x'.repeat(500) })] },
    }
    const result = parseClientMessage(message)

    expect(result.success).toBe(true)
    const diff = result.success && result.data.type === 'op' ? result.data.diff : undefined
    expect(diff?.name).toHaveLength(CAPS.name)
    expect(diff?.factories?.[0].name).toHaveLength(CAPS.name)
  })

  it('rejects junk', () => {
    expect(parseClientMessage(null).success).toBe(false)
    expect(parseClientMessage('op').success).toBe(false)
    expect(parseFactory(undefined).success).toBe(false)
  })
})
