import { APP_VERSION_HEADER, PROTOCOL_VERSION } from 'common'
import type { VersionMismatchBody } from 'common'

import { API_URL } from '../config'
import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { addFactory, openPlanner, settle } from '../helpers/planner'

/** Anything that is not `PROTOCOL_VERSION`; the gate matches exactly. */
const STALE_VERSION = '0.0.1-stale'

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

/**
 * The same prompt, with nothing fabricated. The test above serves the 426 from inside the
 * browser, so it only ever proved the prompt renders — the gate itself, the header name it
 * reads and the CORS allowance that lets that name reach it are all untouched by it.
 *
 * Here the version the client sends is rewritten on the wire and the real API answers. The
 * header is named from the shared constant rather than written out, so the rename to
 * `X-Planner-Version` moves this test with it instead of leaving it asserting on a name
 * nothing sends any more. `fallback` rather than `continue`, so the client-address header
 * the account helper adds further down the chain still gets applied.
 */
test('the real API refuses a stale version, and that is what raises the prompt', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const context = await client({ user })
  const page = await openPlanner(context)

  const refused = page.waitForResponse(
    response => response.url().startsWith(API_URL) && response.status() === 426,
    { timeout: 30_000 },
  )

  await context.route(`${API_URL}/**`, route => route.fallback({
    headers: {
      ...route.request().headers(),
      [APP_VERSION_HEADER.toLowerCase()]: STALE_VERSION,
    },
  }))

  await page.reload()

  const body = await (await refused).json() as VersionMismatchBody
  expect(body.code).toBe('version_mismatch')
  expect(body.requiredVersion).toBe(PROTOCOL_VERSION)
  // The gate read the header this client actually sent, which is the half a fabricated
  // response cannot show and the half a header rename breaks.
  expect(body.receivedVersion).toBe(STALE_VERSION)

  await settle(page)
  await expect(page.getByTestId('version-prompt')).toBeVisible()
  await expect(page.getByTestId('version-refresh')).toBeVisible()
})
