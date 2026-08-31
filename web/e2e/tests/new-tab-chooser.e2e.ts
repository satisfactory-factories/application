import type { Page } from '@playwright/test'

import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { openPlanner, readTabBar, settle } from '../helpers/planner'

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
