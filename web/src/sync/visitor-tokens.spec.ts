import { beforeEach, describe, expect, it } from 'vitest'
import {
  readVisitorToken,
  readVisitorTokens,
  removeVisitorToken,
  setVisitorToken,
  VISITOR_TOKEN_KEY,
} from '@/sync/visitor-tokens'

describe('visitor-tokens', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps a token per room', () => {
    setVisitorToken('room-1', 'one')
    setVisitorToken('room-2', 'two')

    expect(readVisitorToken('room-1')).toBe('one')
    expect(readVisitorToken('room-2')).toBe('two')
  })

  it('replaces a token when the password is rotated', () => {
    setVisitorToken('room-1', 'old')
    setVisitorToken('room-1', 'new')

    expect(readVisitorToken('room-1')).toBe('new')
  })

  it('has nothing for a room this browser never joined', () => {
    expect(readVisitorToken('room-1')).toBeUndefined()
  })

  it('forgets a token on request', () => {
    setVisitorToken('room-1', 'one')

    removeVisitorToken('room-1')

    expect(readVisitorToken('room-1')).toBeUndefined()
  })

  it('repairs a corrupt store rather than throwing', () => {
    localStorage.setItem(VISITOR_TOKEN_KEY, '{ not json')

    expect(readVisitorTokens()).toEqual({})
  })

  it('drops entries that are not tokens', () => {
    localStorage.setItem(VISITOR_TOKEN_KEY, JSON.stringify({ 'room-1': 7, 'room-2': '', 'room-3': 'ok' }))

    expect(readVisitorTokens()).toEqual({ 'room-3': 'ok' })
  })
})
