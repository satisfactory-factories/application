import type { Page } from '@playwright/test'

import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import {
  addFactory,
  createSyncedTab,
  mirroredFactories,
  openPlanner,
  readTabBar,
  settle,
  waitForTab,
} from '../helpers/planner'
import { hidePlan } from '../helpers/rooms'

const openChooser = async (page: Page) => {
  await page.getByTestId('add-tab').click()
  await expect(page.getByTestId('choose-local-tab')).toBeVisible()
}

test('a signed-out visitor is offered a local tab and told a synced one needs an account', async ({
  client,
}) => {
  const page = await openPlanner(await client())

  await openChooser(page)

  await expect(page.getByTestId('choose-synced-tab')).not.toHaveClass(/v-card--disabled/)
  await expect(page.getByTestId('synced-needs-account')).toBeVisible()

  const before = (await readTabBar(page)).length
  await page.getByTestId('choose-local-tab').click()
  await expect(page.getByTestId('choose-local-tab')).toBeHidden()
  await settle(page)

  const bar = await readTabBar(page)
  expect(bar).toHaveLength(before + 1)
  expect(bar.at(-1)).toEqual(expect.objectContaining({ kind: 'local' }))
})

test('an account opens the synced half of the same chooser', async ({ client, request }) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client({ user }))

  await openChooser(page)

  await expect(page.getByTestId('choose-synced-tab')).not.toHaveClass(/v-card--disabled/)
  await expect(page.getByTestId('synced-needs-account')).toBeHidden()
})

// The choice survives the sign-in: picking synced without an account used to be a
// dead end that told the visitor to go and log in somewhere else first.
test('signing in inside the chooser still gets the synced tab that was asked for', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client())

  await openChooser(page)
  await page.getByTestId('choose-synced-tab').click()

  await expect(page.getByTestId('auth-form')).toBeVisible()
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()

  // Nothing else to click: the tab the visitor asked for is made for them.
  await expect(page.getByTestId('choose-local-tab')).toBeHidden({ timeout: 20_000 })
  await settle(page)

  await expect.poll(async () => (await readTabBar(page)).map(entry => entry.kind), {
    timeout: 30_000,
    message: 'the synced tab never appeared in the bar',
  }).toContain('synced')
})

/**
 * The way back in. Hiding a plan is a per-browser move, so getting it back has to
 * be one too — and the button someone reaches for when they want a tab they have
 * not got is the plus, not the account panel three clicks away.
 */
test('the plus button offers the account plans this browser has closed', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client({ user }))

  const roomId = await createSyncedTab(page)
  await addFactory(page, { name: 'Put away for now', note: 'made before hiding it' })
  await hidePlan(page, user, roomId)

  await openChooser(page)

  // Listed here because it is closed here; the row is the panel's own.
  const row = page.locator(`[data-testid="show-plan"][data-room-id="${roomId}"]`)
  await expect(page.getByTestId('open-existing-plans')).toBeVisible()
  await expect(row).toBeVisible()

  await row.click()
  await expect(page.getByTestId('choose-local-tab')).toBeHidden()
  await waitForTab(page, roomId)
  await settle(page)

  // Opened, and filled: the plan comes back whole rather than as an empty tab.
  await expect.poll(
    async () => (await mirroredFactories(page, roomId)).map(entry => entry.name),
    { message: 'the reopened plan never got its content back' },
  ).toEqual(['Put away for now'])

  // And with it open, the dialog has nothing left to offer.
  await openChooser(page)
  await expect(page.getByTestId('open-existing-plans')).toBeHidden()
})
