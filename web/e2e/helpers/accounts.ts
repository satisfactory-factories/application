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

const headers = { [APP_VERSION_HEADER]: PROTOCOL_VERSION }

/**
 * Registration goes over the API rather than through the sign-in tray: these
 * tests are about what syncs, and driving the form would only add a way for them
 * to fail for an unrelated reason.
 */
export const registerUser = async (request: APIRequestContext): Promise<TestUser> => {
  const username = unique('e2e')
  const password = `pw-${uniqueSuffix()}`

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

interface ClientOptions {
  /** Omit for an anonymous browser, exactly as a first-time visitor arrives. */
  user?: TestUser
}

/**
 * One browser context is one device: its own localStorage, its own socket. The
 * session is seeded through storage state rather than an init script so nothing
 * re-writes the token on later navigations.
 *
 * The two dismissal flags keep the welcome dialog and the release splash off the
 * screen; both are modal overlays that would swallow every click.
 */
export const newClient = async (
  browser: Browser,
  { user }: ClientOptions = {},
): Promise<BrowserContext> => {
  const storage = [
    { name: 'dismissed-introduction', value: 'true' },
    { name: 'seenV51Splash', value: 'true' },
    { name: 'newTabChooserSeen', value: 'true' },
  ]
  if (user) {
    storage.push({ name: 'token', value: user.token }, { name: 'loggedInUser', value: user.username })
  }

  return browser.newContext({
    storageState: { cookies: [], origins: [{ origin: WEB_URL, localStorage: storage }] },
  })
}
