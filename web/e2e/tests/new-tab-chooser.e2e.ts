import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { openPlanner, readTabBar, settle } from '../helpers/planner'

const openChooser = async (page: import('@playwright/test').Page) => {
  await page.getByTestId('add-tab').click()
  await expect(page.getByTestId('choose-local-tab')).toBeVisible()
}

test('a signed-out visitor is offered a local tab and told why the synced one is shut', async ({
  client,
}) => {
  const page = await openPlanner(await client())

  await openChooser(page)

  await expect(page.getByTestId('choose-synced-tab')).toHaveClass(/v-card--disabled/)
  await expect(page.getByText('Sign in to create a synced tab')).toBeVisible()

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
  await expect(page.getByText('Sign in to create a synced tab')).toBeHidden()
})
