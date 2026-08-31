import type { Page } from '@playwright/test'

import { expect, test } from '../helpers/fixtures'
import { readServerPreferences, registerUser } from '../helpers/accounts'
import {
  addFactory,
  createSyncedTab,
  openPlanner,
  selectTab,
  settle,
} from '../helpers/planner'
import { showPlan } from '../helpers/rooms'
import { signIn } from '../helpers/session'

/** The switch is per factory, so it only exists once a factory is on screen. */
const breakdownToggle = (page: Page) =>
  page.locator('[id$="-satisfaction-breakdown-toggle"]')

const storedPreference = (page: Page) =>
  page.evaluate(() => localStorage.getItem('showSatisfactionBreakdowns'))

test('a preference set on one device is there on the next login', async ({ client, request }) => {
  const user = await registerUser(request)

  const first = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(first)
  await addFactory(first, { name: 'Preference holder', note: 'somewhere to put the switch' })

  await breakdownToggle(first).click()
  await expect.poll(() => storedPreference(first)).toBe('true')

  // Asking the server is the only thing that separates "pushed" from "about to
  // be": the next device fetches preferences exactly once, when it signs in.
  await expect.poll(async () => (await readServerPreferences(request, user)).showSatisfactionBreakdowns, {
    timeout: 20_000,
    message: 'the preference never reached the account',
  }).toBe(true)

  // A browser that has never seen this account, signing in for the first time.
  const second = await openPlanner(await client())
  expect(await storedPreference(second)).toBeNull()
  await signIn(second, user)

  await expect.poll(() => storedPreference(second), {
    timeout: 20_000,
    message: 'the account\'s preference never reached the new device',
  }).toBe('true')

  // And the planner reads it as the setting it is, not just a stored string.
  await second.reload()
  await settle(second)
  await showPlan(second, user, roomId)
  await selectTab(second, roomId)
  await expect(breakdownToggle(second)).toBeChecked()
})
