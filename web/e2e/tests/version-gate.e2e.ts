import { PROTOCOL_VERSION } from 'common'

import { API_URL } from '../config'
import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { addFactory, openPlanner, settle } from '../helpers/planner'

test('a 426 from the API raises the refresh prompt and leaves the planner usable', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const context = await client({ user })
  const page = await openPlanner(context)

  // What a deployed backend answers a client it has aged out of.
  await context.route(`${API_URL}/**`, route => route.fulfill({
    status: 426,
    contentType: 'application/json',
    body: JSON.stringify({
      code: 'version_mismatch',
      message: 'This version of the planner is out of date.',
      requiredVersion: '99.0.0',
      receivedVersion: PROTOCOL_VERSION,
    }),
  }))

  // The token check on load is the first gated call every session makes.
  await page.reload()
  await settle(page)

  const prompt = page.getByTestId('version-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('A new version is available. Refresh to continue syncing.')
  await expect(page.getByTestId('version-refresh')).toBeVisible()

  // Persistent by design: nothing dismisses it, and the planner keeps working
  // underneath it rather than being blocked.
  await addFactory(page, { name: 'Still editable', note: 'made while out of date' })
  await expect(page.locator('input.factory-name')).toHaveValue('Still editable')
  await expect(prompt).toBeVisible()
})
