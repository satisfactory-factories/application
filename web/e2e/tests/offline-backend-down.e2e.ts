import type { Locator, Page, Route } from '@playwright/test'

import { API_URL } from '../config'
import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { installWsGate } from '../helpers/network'
import type { WsGate } from '../helpers/network'
import { addFactory, createSyncedTab, openPlanner } from '../helpers/planner'
import { closeAccountPanel, openAccountPanel, setOfflineMode } from '../helpers/session'

/**
 * Longer than one quick health retry (5s), so a banner that was going to come up has had
 * every chance to before the test says it never did.
 */
const QUIET_MS = 8_000

/**
 * A banner that flashed up for a few seconds and cleared itself would pass a single look at the
 * end, so this looks all the way through.
 */
const expectNeverVisible = async (page: Page, locator: Locator, ms = QUIET_MS): Promise<void> => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    expect(await locator.isVisible(), 'the backend warning came up in offline mode').toBe(false)
    await page.waitForTimeout(100)
  }
}

/**
 * The API stops answering while the browser keeps its network, which is what a flapping home
 * connection in front of the server looks like from the reader's side. Page routes win over the
 * context's address-claiming route, so nothing reaches the API until `restore`.
 */
const cutBackend = async (page: Page, gate: WsGate): Promise<() => Promise<void>> => {
  const abort = (route: Route) => route.abort('connectionrefused')
  await page.route(`${API_URL}/**`, abort)
  await gate.kill()

  return async () => {
    await page.unroute(`${API_URL}/**`, abort)
    gate.restore()
  }
}

test('offline mode never warns that the backend is down while the browser has network', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)

  let gate!: WsGate
  const page = await openPlanner(await client({ user }), '/', async p => { gate = await installWsGate(p) })
  await createSyncedTab(page)

  const banner = page.getByTestId('backend-health-banner')

  await setOfflineMode(page, user, true)
  const restore = await cutBackend(page, gate)

  await expectNeverVisible(page, banner)
  expect(await page.evaluate(() => navigator.onLine)).toBe(true)
  await expect(page.getByTestId('tab-bar-offline')).toContainText('Offline mode')

  // Something waiting to sync, which is what the warning is there for once offline mode is off.
  await addFactory(page, { name: 'Made offline', note: 'still owed to the server' })

  // The control: the same outage with offline mode off does raise it, so the silence above
  // was offline mode's doing rather than a banner that could not have appeared anyway.
  await openAccountPanel(page, user)
  await page.getByTestId('offline-switch').locator('input').click()
  await closeAccountPanel(page)
  await expect(banner).toBeVisible({ timeout: 30_000 })

  // And back into offline mode with the server still away: the banner goes and stays gone.
  await setOfflineMode(page, user, true)
  await expect(banner).toBeHidden()
  await expectNeverVisible(page, banner)

  await restore()
})

/**
 * The race behind the flapping reports: the connection drops, a health check goes out, and the
 * reader switches to offline mode before it comes back. That check failing afterwards is old
 * news about a server the reader has already chosen to stop hearing about.
 */
test('a health check still out when offline mode goes on does not raise the warning', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)

  let gate!: WsGate
  const page = await openPlanner(await client({ user }), '/', async p => { gate = await installWsGate(p) })
  await createSyncedTab(page)

  let held!: Route
  const healthOut = new Promise<void>(resolve => {
    void page.route(`${API_URL}/health`, route => {
      held = route
      resolve()
    })
  })

  // A dropped socket is what sends a check out straight away rather than at the next poll.
  await gate.kill()
  await healthOut

  await setOfflineMode(page, user, true)
  await held.abort('connectionrefused')

  await expectNeverVisible(page, page.getByTestId('backend-health-banner'))
})

/**
 * The flapping reports again, from the other side: a reader with nothing waiting to sync loses
 * nothing while the server is away, so a blip is not worth telling them about. The warning waits
 * until there is something to warn about.
 */
test('the backend warning waits until there is something unsynced', async ({ client, request }) => {
  const user = await registerUser(request)

  let gate!: WsGate
  const page = await openPlanner(await client({ user }), '/', async p => { gate = await installWsGate(p) })
  await createSyncedTab(page)

  const banner = page.getByTestId('backend-health-banner')
  const restore = await cutBackend(page, gate)

  await expectNeverVisible(page, banner)
  await expect(page.getByTestId('offline-prompt')).toBeHidden()

  await addFactory(page, { name: 'Unsynced', note: 'made while the server is away' })
  await expect(banner).toBeVisible({ timeout: 30_000 })

  await restore()
  await expect(banner).toBeHidden({ timeout: 60_000 })
})
