import { beforeEach, describe, expect, it } from 'vitest'
import {
  fingerprintPreferences,
  isPreferenceKey,
  readLocalPreferences,
  writeLocalPreferences,
} from '@/sync/preferences-mirror'

describe('preferences-mirror', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads only the keys this browser actually holds', () => {
    localStorage.setItem('summaryHidden', 'true')

    // An absent preference is not `false`: the server must be able to tell
    // "never set here" from "deliberately off".
    expect(readLocalPreferences()).toEqual({ summaryHidden: true })
  })

  it('decodes booleans the way every component writes them', () => {
    localStorage.setItem('statisticsHidden', 'true')
    localStorage.setItem('shortageJumpToFactory', 'false')

    expect(readLocalPreferences()).toEqual({
      statisticsHidden: true,
      shortageJumpToFactory: false,
    })
  })

  it('decodes the custom colour list as an array of strings', () => {
    localStorage.setItem('factoryGroupCustomColors', '["#123456", 7, "#abcdef"]')

    expect(readLocalPreferences().factoryGroupCustomColors).toEqual(['#123456', '#abcdef'])
  })

  it('drops a corrupt array rather than throwing', () => {
    localStorage.setItem('factoryGroupCustomColors', 'not json')

    expect(readLocalPreferences()).toEqual({})
  })

  it('writes back into the same keys the components read', () => {
    writeLocalPreferences({ summaryHidden: true, factoryGroupCustomColors: ['#000000'] })

    expect(localStorage.getItem('summaryHidden')).toBe('true')
    expect(localStorage.getItem('factoryGroupCustomColors')).toBe('["#000000"]')
  })

  it('leaves keys the payload does not mention alone', () => {
    localStorage.setItem('statisticsHidden', 'true')
    writeLocalPreferences({ summaryHidden: false })

    expect(localStorage.getItem('statisticsHidden')).toBe('true')
  })

  it('ignores anything outside the enumerated keys', () => {
    localStorage.setItem('sidebarOpen', 'false')

    expect(isPreferenceKey('sidebarOpen')).toBe(false)
    expect(readLocalPreferences()).toEqual({})
  })

  it('fingerprints by key order, not by insertion order', () => {
    const one = fingerprintPreferences({ summaryHidden: true, statisticsHidden: false })
    const two = fingerprintPreferences({ statisticsHidden: false, summaryHidden: true })

    expect(one).toBe(two)
  })

  it('fingerprints an absent key differently from a false one', () => {
    expect(fingerprintPreferences({})).not.toBe(fingerprintPreferences({ summaryHidden: false }))
  })
})
