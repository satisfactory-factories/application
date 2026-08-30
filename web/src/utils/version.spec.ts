import { describe, expect, it } from 'vitest'
import { isNewerVersion, parseVersion } from '@/utils/version'

describe('parseVersion', () => {
  it('parses a full version', () => {
    expect(parseVersion('1.2.3')).toEqual({ core: [1, 2, 3], prerelease: [] })
  })

  it('pads a partial version', () => {
    expect(parseVersion('0.6')).toEqual({ core: [0, 6, 0], prerelease: [] })
  })

  it('tolerates a leading v and surrounding whitespace', () => {
    expect(parseVersion(' v1.0.0 ')).toEqual({ core: [1, 0, 0], prerelease: [] })
  })

  it('keeps prerelease identifiers and drops build metadata', () => {
    expect(parseVersion('0.6.0-beta.1+abc123')).toEqual({ core: [0, 6, 0], prerelease: ['beta', '1'] })
  })

  it('rejects anything it cannot read as a version', () => {
    for (const value of ['', '   ', 'unknown', '1.2.3.4', '1.two.3', '0.6.0-', null, undefined]) {
      expect(parseVersion(value)).toBeNull()
    }
  })
})

describe('isNewerVersion', () => {
  it('is true only when the candidate is ahead', () => {
    expect(isNewerVersion('0.6.1', '0.6.0')).toBe(true)
    expect(isNewerVersion('0.7.0', '0.6.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
  })

  it('is false for the same version', () => {
    expect(isNewerVersion('0.6.0', '0.6.0')).toBe(false)
    expect(isNewerVersion('v0.6', '0.6.0')).toBe(false)
  })

  // Web deploys ahead of the API on any release, and must not be nagged for it.
  it('is false when this build is ahead of the server', () => {
    expect(isNewerVersion('0.6.0', '0.6.1')).toBe(false)
  })

  it('ranks a release above its own prereleases', () => {
    expect(isNewerVersion('0.6.0', '0.6.0-beta.1')).toBe(true)
    expect(isNewerVersion('0.6.0-beta.1', '0.6.0')).toBe(false)
    expect(isNewerVersion('0.6.0-beta.2', '0.6.0-beta.1')).toBe(true)
  })

  // The API reports 'unknown' when it cannot read its own version, and a proxy can return
  // anything at all. Neither is grounds for telling someone to reload.
  it('is false when either side is unreadable', () => {
    expect(isNewerVersion('unknown', '0.6.0')).toBe(false)
    expect(isNewerVersion('0.7.0', 'unknown')).toBe(false)
    expect(isNewerVersion(null, '0.6.0')).toBe(false)
    expect(isNewerVersion(undefined, undefined)).toBe(false)
    expect(isNewerVersion('<!doctype html>', '0.6.0')).toBe(false)
  })
})
