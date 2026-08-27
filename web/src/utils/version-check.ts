// Polls the API for the version the site is currently on, and announces one that is newer than
// this build so the user can reload when it suits them. Issue #166.
//
// The version gate in `api.ts` is the other half of this and a different thing: that one fires
// when the API *refuses* this build, and blocks. This one is advisory and dismissible.

import { config } from '@/config/config'
import eventBus from '@/utils/eventBus'
import { apiHeaders } from '@/utils/api'
import { isNewerVersion } from '@/utils/version'

export const VERSION_POLL_INTERVAL_MS = 60_000

// Survives a reload, unlike a ref, and dies with the tab, unlike localStorage. That is exactly
// the lifetime wanted: the API can start reporting a release before the web host finishes
// serving it, and without this the reload lands on the same build and prompts again, and again.
const ANNOUNCED_KEY = 'announcedVersion'

const alreadyAnnounced = (version: string): boolean => {
  try {
    return sessionStorage.getItem(ANNOUNCED_KEY) === version
  } catch {
    // Private-mode browsers throw on sessionStorage. One extra prompt beats no feature.
    return false
  }
}

const rememberAnnounced = (version: string) => {
  try {
    sessionStorage.setItem(ANNOUNCED_KEY, version)
  } catch {}
}

// Any failure here is silent by design. The API being slow, down, blocked by an extension or
// serving a proxy error page is not something to interrupt someone's planning about.
const fetchServerVersion = async (): Promise<string | null> => {
  try {
    const response = await fetch(`${config.apiUrl}/version`, {
      method: 'GET',
      headers: apiHeaders(),
      cache: 'no-store',
    })

    if (!response.ok) return null

    const body = await response.json()
    const version = body?.version
    return typeof version === 'string' ? version : null
  } catch (error) {
    console.debug('version-check: could not read the server version', error)
    return null
  }
}

// Returns a stop function. Nothing is left running once it is called, which matters in tests and
// on any page that unmounts the layout.
export const startVersionCheck = (): (() => void) => {
  let timer: ReturnType<typeof setInterval> | undefined
  let stopped = false

  const stop = () => {
    stopped = true
    clearInterval(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  const check = async () => {
    // A hidden tab cannot act on the news, and a pinned one left open for a week should not be
    // asking every minute regardless.
    if (stopped || document.hidden) return

    const serverVersion = await fetchServerVersion()
    if (stopped || !serverVersion) return

    if (!isNewerVersion(serverVersion, config.appVersion)) return

    // Nothing further to learn: the answer cannot become more true, and the prompt is already up.
    stop()

    if (alreadyAnnounced(serverVersion)) {
      console.debug(`version-check: ${serverVersion} was already announced in this tab.`)
      return
    }

    rememberAnnounced(serverVersion)
    console.log(`version-check: the site is on ${serverVersion}, this tab is on ${config.appVersion}.`)
    eventBus.emit('updateAvailable', { version: serverVersion })
  }

  // A tab coming back into view is the moment the answer matters most, and the moment its
  // information is most likely to be a minute stale.
  function onVisibilityChange () {
    if (!document.hidden) void check()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  timer = setInterval(() => void check(), VERSION_POLL_INTERVAL_MS)

  // Checked immediately as well as on the interval: a tab restored from yesterday's session
  // should not sit there for a minute before being told.
  void check()

  return stop
}
