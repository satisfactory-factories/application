import { randomBytes } from 'node:crypto'

import { APP_VERSION_HEADER, PROTOCOL_VERSION } from 'common'
import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test'

import { API_URL, WEB_URL } from '../config'

export interface TestUser {
  username: string
  password: string
  token: string
}

/** Short but unique: the API caps usernames, and every test wants its own account. */
const uniqueSuffix = (): string => randomBytes(5).toString('hex')

export const unique = (prefix: string): string => `${prefix}-${uniqueSuffix()}`

/**
 * The API sits behind one trusted hop (`trust proxy = 1`) and reads the client's
 * address from `X-Forwarded-For`, so each simulated device announces one of its
 * own — which is what production actually delivers. Sharing the loopback address
 * would instead put the whole suite in one 200-per-5-minutes bucket, and the last
 * third of it would be refused before it started. RFC 5737 documentation range.
 */
let devices = 0
const nextClientAddress = (): string => `203.0.113.${(devices++ % 254) + 1}`

const versionHeader = { [APP_VERSION_HEADER]: PROTOCOL_VERSION }

const apiHeaders = (address: string, token?: string): Record<string, string> => ({
  ...versionHeader,
  'X-Forwarded-For': address,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

/**
 * Registration goes over the API rather than through the sign-in tray: these
 * tests are about what syncs, and driving the form would only add a way for them
 * to fail for an unrelated reason.
 */
export const registerUser = async (request: APIRequestContext): Promise<TestUser> => {
  const username = unique('e2e')
  const password = `pw-${uniqueSuffix()}`
  const headers = apiHeaders(nextClientAddress())

  const registered = await request.post(`${API_URL}/register`, {
    headers,
    data: { username, password },
  })
  if (!registered.ok()) {
    throw new Error(`register failed (${registered.status()}): ${await registered.text()}`)
  }

  const loggedIn = await request.post(`${API_URL}/login`, {
    headers,
    data: { username, password },
  })
  if (!loggedIn.ok()) {
    throw new Error(`login failed (${loggedIn.status()}): ${await loggedIn.text()}`)
  }

  const { token } = await loggedIn.json() as { token: string }
  return { username, password, token }
}

/**
 * What the account actually holds, read straight from the API. Asking the server
 * is the only way to know a preference has been pushed before the next device
 * signs in and fetches it once.
 */
export const readServerPreferences = async (
  request: APIRequestContext,
  user: TestUser,
): Promise<Record<string, unknown>> => {
  const response = await request.get(`${API_URL}/preferences`, {
    headers: apiHeaders(nextClientAddress(), user.token),
  })
  if (!response.ok()) {
    throw new Error(`GET /preferences failed (${response.status()}): ${await response.text()}`)
  }

  const { prefs } = await response.json() as { prefs: Record<string, unknown> }
  return prefs
}

interface ClientOptions {
  /** Omit for an anonymous browser, exactly as a first-time visitor arrives. */
  user?: TestUser
}

/**
 * One browser context is one device: its own localStorage, its own socket. The
 * session is seeded through storage state rather than an init script so nothing
 * re-writes the token on later navigations.
 *
 * The dismissal flags keep the welcome dialog and the release decks off the screen;
 * every one is a modal overlay that would swallow every click. Each release adds its
 * own key (`seenV<n>Splash`), so a new deck needs a new line here or the whole suite
 * times out clicking through a scrim.
 */
export const newClient = async (
  browser: Browser,
  { user }: ClientOptions = {},
): Promise<BrowserContext> => {
  const storage = [
    { name: 'dismissed-introduction', value: 'true' },
    { name: 'seenV51Splash', value: 'true' },
    { name: 'seenV6Splash', value: 'true' },
    { name: 'newTabChooserSeen', value: 'true' },
  ]
  if (user) {
    storage.push({ name: 'token', value: user.token }, { name: 'loggedInUser', value: user.username })
  }

  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: WEB_URL, localStorage: storage }] },
  })

  // Injected in the route rather than through extraHTTPHeaders: the browser would
  // preflight an unknown header, and the API's CORS allowlist would refuse it —
  // correctly, since in production the hop in front of it is what sets this.
  const address = nextClientAddress()
  await context.route(`${API_URL}/**`, route => route.continue({
    headers: { ...route.request().headers(), 'x-forwarded-for': address },
  }))

  // E2E_CPU_THROTTLE=6 makes every page ~6x slower, approximating a loaded CI
  // runner: the race windows between UI actions, debounces and rebases open wide
  // enough to reproduce CI-only failures on a fast dev machine.
  const throttle = Number(process.env.E2E_CPU_THROTTLE ?? 0)
  if (throttle > 1) {
    context.on('page', page => {
      void context.newCDPSession(page)
        .then(session => session.send('Emulation.setCPUThrottlingRate', { rate: throttle }))
        .catch(() => {})
    })
  }

  return context
}
