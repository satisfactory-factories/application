import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startVersionCheck, VERSION_POLL_INTERVAL_MS } from '@/utils/version-check'
import eventBus from '@/utils/eventBus'
import { config } from '@/config/config'

const respondWith = (version: unknown, ok = true) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: async () => ({ version }),
  }))
}

const hide = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

// The tests express "newer" and "older" relative to whatever this build actually is.
const bump = (version: string, by: number) => {
  const parts = version.split('.').map(Number)
  parts[2] = (parts[2] || 0) + by
  return parts.join('.')
}
const newer = () => bump(config.appVersion, 1)
const older = () => bump(config.appVersion, -1)

let stop: (() => void) | undefined

describe('startVersionCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hide(false)
    sessionStorage.clear()
    vi.spyOn(eventBus, 'emit')
  })

  afterEach(() => {
    stop?.()
    stop = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should check immediately rather than waiting out the first interval', async () => {
    respondWith(config.appVersion)
    stop = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('should announce a release that is newer than this build', async () => {
    respondWith(newer())
    stop = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)

    expect(eventBus.emit).toHaveBeenCalledWith('updateAvailable', { version: newer() })
  })

  it('should say nothing when the server matches or trails this build', async () => {
    for (const version of [config.appVersion, older()]) {
      respondWith(version)
      const stopThis = startVersionCheck()
      await vi.advanceTimersByTimeAsync(0)
      stopThis()
    }

    expect(eventBus.emit).not.toHaveBeenCalledWith('updateAvailable', expect.anything())
  })

  it('should keep polling on the interval until it finds something', async () => {
    respondWith(config.appVersion)
    stop = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(VERSION_POLL_INTERVAL_MS * 2)

    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('should stop polling once it has announced a release', async () => {
    respondWith(newer())
    stop = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(VERSION_POLL_INTERVAL_MS * 3)

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('should not poll while the tab is hidden', async () => {
    respondWith(config.appVersion)
    hide(true)
    stop = startVersionCheck()
    await vi.advanceTimersByTimeAsync(VERSION_POLL_INTERVAL_MS)

    expect(fetch).not.toHaveBeenCalled()
  })

  it('should check as soon as the tab is looked at again', async () => {
    respondWith(config.appVersion)
    hide(true)
    stop = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).not.toHaveBeenCalled()

    hide(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  // The API can report a release before the web host finishes serving it. Reloading into the
  // same old build must not produce the same prompt over and over.
  it('should announce a given version only once per tab', async () => {
    respondWith(newer())
    stop = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)
    expect(eventBus.emit).toHaveBeenCalledWith('updateAvailable', { version: newer() })

    vi.mocked(eventBus.emit).mockClear()
    const afterReload = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)
    afterReload()

    expect(eventBus.emit).not.toHaveBeenCalledWith('updateAvailable', expect.anything())
  })

  it('should stay silent when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    stop = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)

    expect(eventBus.emit).not.toHaveBeenCalledWith('updateAvailable', expect.anything())
  })

  it('should stay silent on an error status or an unusable payload', async () => {
    respondWith(newer(), false)
    let stopThis = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)
    stopThis()

    for (const payload of [undefined, null, 42, 'unknown', '<!doctype html>']) {
      respondWith(payload)
      stopThis = startVersionCheck()
      await vi.advanceTimersByTimeAsync(0)
      stopThis()
    }

    expect(eventBus.emit).not.toHaveBeenCalledWith('updateAvailable', expect.anything())
  })

  it('should make no further requests once stopped', async () => {
    respondWith(config.appVersion)
    const stopThis = startVersionCheck()
    await vi.advanceTimersByTimeAsync(0)
    stopThis()
    await vi.advanceTimersByTimeAsync(VERSION_POLL_INTERVAL_MS * 2)

    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
