import type { Page } from '@playwright/test'

import { PROBE_INTERVAL_MS } from '../config'
import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import {
  addFactory,
  closeTabSettings,
  createSyncedTab,
  deleteCurrentTab,
  dragTab,
  expectTabKind,
  openPlanner,
  openTabSettings,
  readTabBar,
  renameCurrentTab,
  selectTab,
  settle,
  tabNames,
  waitForRevision,
  waitForTab,
} from '../helpers/planner'
import { hidePlan, shareARoom, showPlan, syncedPair } from '../helpers/rooms'

/** The account's tabs, in bar order. The local "Default" tab is nobody else's business. */
const syncedNames = async (page: Page): Promise<string[]> =>
  (await readTabBar(page)).filter(entry => entry.kind !== 'local').map(entry => entry.name)

const hasTab = async (page: Page, tabId: string): Promise<boolean> =>
  (await readTabBar(page)).some(entry => entry.id === tabId)

test('a tab created, renamed and deleted on one device follows the account', async ({
  client,
  request,
}) => {
  const { user, first, second } = await syncedPair(client, request)

  const created = await createSyncedTab(first)
  // A room made elsewhere stays hidden here until this device opens it.
  await showPlan(second, user, created)
  await expectTabKind(second, created, 'synced')

  await renameCurrentTab(first, 'Renamed on the first device')
  await expect.poll(() => tabNames(second), {
    message: 'the rename never reached the second device',
  }).toContain('Renamed on the first device')

  await selectTab(first, created)
  await deleteCurrentTab(first)
  await expect.poll(() => hasTab(first, created), {
    message: 'the deleted tab stayed in the owner\'s bar',
  }).toBe(false)

  // Revocation never destroys data: the other device keeps the plan, locally.
  await expectTabKind(second, created, 'local')
})

/**
 * The tab bar is the per-browser open set: Hide closes the tab and nothing else,
 * a reload cannot resurrect it, and Show brings the plan back from the account
 * with everything it held. The plan itself never leaves the server.
 */
test('a hidden plan survives a reload hidden, and Show brings it all back', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(page)
  await addFactory(page, { name: 'Hidden cargo', note: 'kept on the account' })
  await waitForRevision(page, roomId, 1)

  await hidePlan(page, user, roomId)
  await expect.poll(() => hasTab(page, roomId), {
    message: 'the hidden plan kept its tab',
  }).toBe(false)

  await page.reload()
  await settle(page)
  expect(await hasTab(page, roomId), 'a reload re-opened the hidden plan').toBe(false)

  await showPlan(page, user, roomId)
  await expectTabKind(page, roomId, 'synced')
  await selectTab(page, roomId)
  await expect(page.locator('input.factory-name')).toHaveValue('Hidden cargo')
})

test('a tab order dragged on one device reaches the other', async ({ client, request }) => {
  const { user, roomId, first, second } = await syncedPair(client, request)

  await selectTab(first, roomId)
  await renameCurrentTab(first, 'First plan')
  const other = await createSyncedTab(first)
  await renameCurrentTab(first, 'Second plan')

  await showPlan(second, user, other)
  await expect.poll(() => syncedNames(second)).toEqual(['First plan', 'Second plan'])

  // Index 0 is the local Default tab, which the server has no row for.
  await dragTab(first, 2, 1)

  await expect.poll(() => syncedNames(first), {
    message: 'the drag did not reorder the bar it happened in',
  }).toEqual(['Second plan', 'First plan'])
  await expect.poll(() => syncedNames(second), {
    message: 'the order never reached the second device',
  }).toEqual(['Second plan', 'First plan'])
})

/**
 * The same drag, made after both devices have sat idle across two revision-probe
 * cycles. The probe re-joins every idle room, so this is the reorder racing the
 * healing path rather than a quiet socket. `E2E_PROBE_MS=2000` compresses it.
 */
test('a tab order dragged after an idle soak still reaches the other', async ({
  client,
  request,
}) => {
  const { user, roomId, first, second } = await syncedPair(client, request)

  await selectTab(first, roomId)
  await renameCurrentTab(first, 'Soak one')
  const other = await createSyncedTab(first)
  await renameCurrentTab(first, 'Soak two')

  await showPlan(second, user, other)
  await expect.poll(() => syncedNames(second)).toEqual(['Soak one', 'Soak two'])

  await first.waitForTimeout(PROBE_INTERVAL_MS * 2 + 1_000)

  await dragTab(first, 2, 1)

  await expect.poll(() => syncedNames(first), {
    message: 'the drag did not reorder the bar it happened in',
  }).toEqual(['Soak two', 'Soak one'])
  await expect.poll(() => syncedNames(second), {
    message: 'the order never reached the second device after the soak',
  }).toEqual(['Soak two', 'Soak one'])
})

test('a member gets the owner\'s rename and is offered no rename of their own', async ({
  client,
  request,
}) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)

  const memberUser = await registerUser(request)
  const member = await openPlanner(await client({ user: memberUser }), invitePath)
  await waitForTab(member, roomId)
  await selectTab(member, roomId)

  // The pencil opens tab settings for every role now; the UI's answer to
  // "members may not rename" is a disabled name field with the reason beside
  // it. Playwright's retry covers the beat between the join and the role
  // landing with the rooms refresh on a slow runner.
  const settings = await openTabSettings(member)
  await expect(settings.locator('[data-testid="tab-name-field"] input'), {
    message: 'the member can still type into the rename field',
  }).toBeDisabled()
  await expect(settings.locator('[data-testid="rename-refusal"]'))
    .toContainText('Only the owner can rename this plan.')
  await closeTabSettings(member)

  await selectTab(owner, roomId)
  await renameCurrentTab(owner, 'Renamed by its owner')

  await expect.poll(() => tabNames(member), {
    message: 'the owner\'s rename never reached the member',
  }).toContain('Renamed by its owner')

  // The rename granted the member nothing: the field is exactly as refused.
  await openTabSettings(member)
  await expect(member.locator('[data-testid="tab-name-field"] input')).toBeDisabled()
  await closeTabSettings(member)
})
