import type { Page } from '@playwright/test'

import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { freezeDatabase } from '../helpers/database'
import {
  addFactory,
  createSyncedTab,
  mirroredFactories,
  openPlanner,
  outstandingIntent,
  settle,
} from '../helpers/planner'
import { showPlan } from '../helpers/rooms'

/**
 * The API and its socket stay up while the database behind them stops answering: `/health` says
 * 503, and every op and every REST read simply hangs. Edits made then used to raise nothing at
 * all, and, on a page opened during the outage, never reached the server even once the database
 * was back.
 */

const banner = (page: Page) => page.getByTestId('backend-health-database')

const expectBannerText = async (page: Page) => {
  await expect(banner(page)).toContainText('Unable to connect to SF\'s database')
  await expect(banner(page)).toContainText('Your changes are not being saved to the cloud')
}

test('an edit the server never acknowledges raises the database warning promptly', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(page)

  const thaw = freezeDatabase()
  try {
    await addFactory(page, { name: 'During outage', note: 'not saved yet' })
    // Well inside the 60s health poll: the unanswered op is what asks.
    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await expectBannerText(page)
    expect(await outstandingIntent(page, roomId)).toBeGreaterThan(0)
  } finally {
    thaw()
  }

  await expect.poll(() => outstandingIntent(page, roomId), { timeout: 30_000 }).toBe(0)
  await expect(banner(page)).toBeHidden({ timeout: 90_000 })
})

test('a page opened while the database is down still counts its edits, and they sync once it is back', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(page)
  await addFactory(page, { name: 'Before', note: 'saved' })
  await expect.poll(() => outstandingIntent(page, roomId), { timeout: 15_000 }).toBe(0)

  const thaw = freezeDatabase()
  try {
    // The room list this reload asks for hangs, and it used to be the only thing that tracked
    // the synced tab: the edit below was then never recorded as unsent.
    await page.reload()
    await settle(page)
    await addFactory(page, { name: 'During outage', note: 'made after the reload' })

    await expect(banner(page)).toBeVisible({ timeout: 15_000 })
    await expectBannerText(page)
    await expect.poll(() => outstandingIntent(page, roomId)).toBeGreaterThan(0)
  } finally {
    thaw()
  }

  await expect.poll(() => outstandingIntent(page, roomId), { timeout: 30_000 }).toBe(0)

  // The server's copy, read through a second device that has never seen the plan.
  const second = await openPlanner(await client({ user }))
  await showPlan(second, user, roomId)
  await expect.poll(
    async () => (await mirroredFactories(second, roomId)).map(factory => factory.name).sort(),
    { timeout: 20_000 },
  ).toEqual(['Before', 'During outage'])
})
