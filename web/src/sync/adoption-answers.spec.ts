import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADOPTION_ANSWERED_KEY,
  hasAnsweredAdoption,
  readAdoptionAnswers,
  rememberAdoptionAnswer,
} from '@/sync/adoption-answers'
import { resetStorageWarning } from '@/utils/safe-storage'

describe('adoption-answers', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    resetStorageWarning()
  })

  it('has nobody answering in a fresh browser', () => {
    expect(readAdoptionAnswers()).toEqual({})
    expect(hasAnsweredAdoption('pioneer')).toBe(false)
  })

  it('remembers the account that answered', () => {
    rememberAdoptionAnswer('pioneer')

    expect(hasAnsweredAdoption('pioneer')).toBe(true)
    expect(readAdoptionAnswers()).toEqual({ pioneer: true })
  })

  // The whole point of the per-account shape: one person's "No thanks" is not an
  // answer on behalf of the next account to sign in on the same machine.
  it('leaves every other account unasked', () => {
    rememberAdoptionAnswer('pioneer')

    expect(hasAnsweredAdoption('engineer')).toBe(false)
  })

  it('keeps the answers already stored when another account answers', () => {
    rememberAdoptionAnswer('pioneer')
    rememberAdoptionAnswer('engineer')

    expect(readAdoptionAnswers()).toEqual({ pioneer: true, engineer: true })
  })

  it('is idempotent, and writes nothing the second time', () => {
    rememberAdoptionAnswer('pioneer')
    const write = vi.spyOn(Storage.prototype, 'setItem')

    rememberAdoptionAnswer('pioneer')

    expect(write).not.toHaveBeenCalled()
    expect(readAdoptionAnswers()).toEqual({ pioneer: true })
  })

  // Nothing calls this signed out, and an answer with no account to hold it would
  // be stored under a key no sign-in can ever match.
  it('stores nothing at all for a nameless account', () => {
    rememberAdoptionAnswer('')

    expect(localStorage.getItem(ADOPTION_ANSWERED_KEY)).toBeNull()
    expect(hasAnsweredAdoption('')).toBe(false)
  })

  describe('reading what is already in the browser', () => {
    // The pre-account shape. Asking the account once more is the safe way to be
    // wrong; silencing an account that never answered is not.
    it('treats the old browser-wide flag as nobody having answered', () => {
      localStorage.setItem(ADOPTION_ANSWERED_KEY, 'true')

      expect(readAdoptionAnswers()).toEqual({})
      expect(hasAnsweredAdoption('pioneer')).toBe(false)
    })

    it('survives a value that is not JSON at all', () => {
      localStorage.setItem(ADOPTION_ANSWERED_KEY, '{ not json')

      expect(readAdoptionAnswers()).toEqual({})
    })

    it('keeps only the entries that really say yes', () => {
      localStorage.setItem(ADOPTION_ANSWERED_KEY, JSON.stringify({
        pioneer: true,
        engineer: false,
        ficsit: 'true',
        '': true,
      }))

      expect(readAdoptionAnswers()).toEqual({ pioneer: true })
    })

    // A refused write must not take the answer with it: the offer coming back is
    // the right failure, and it is the one the caller already handles.
    it('does not throw when the browser refuses to save', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded')
      })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => rememberAdoptionAnswer('pioneer')).not.toThrow()
    })
  })
})
