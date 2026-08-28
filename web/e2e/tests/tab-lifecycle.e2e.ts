import type { Page } from '@playwright/test'

import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import {
  createSyncedTab,
  deleteCurrentTab,
  dragTab,
  expectTabKind,
  openPlanner,
  readTabBar,
  renameAffordance,
  renameCurrentTab,
  selectTab,
  tabNames,
  waitForTab,
} from '../helpers/planner'
import { shareARoom, syncedPair } from '../helpers/rooms'

/** The account's tabs, in bar order. The local "Default" tab is nobody else's business. */
const syncedNames = async (page: Page): Promise<string[]> =>
  (await readTabBar(page)).filter(entry => entry.kind !== 'local').map(entry => entry.name)

const hasTab = async (page: Page, tabId: string): Promise<boolean> =>
  (await readTabBar(page)).some(entry => entry.id === tabId)

test('a tab created, renamed and deleted on one device follows the account', async ({
  client,
  request,
}) => {
  const { first, second } = await syncedPair(client, request)

  const created = await createSyncedTab(first)
  await waitForTab(second, created)
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

test('a tab order dragged on one device reaches the other', async ({ client, request }) => {
  const { roomId, first, second } = await syncedPair(client, request)

  await selectTab(first, roomId)
  await renameCurrentTab(first, 'First plan')
  const other = await createSyncedTab(first)
  await renameCurrentTab(first, 'Second plan')

  await waitForTab(second, other)
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

test('a member gets the owner\'s rename and is offered no rename of their own', async ({
  client,
  request,
}) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)

  const memberUser = await registerUser(request)
  const member = await openPlanner(await client({ user: memberUser }), invitePath)
  await waitForTab(member, roomId)
  await selectTab(member, roomId)

  // The UI's answer to "members may not rename" is that the control is absent.
  expect(await renameAffordance(member).count()).toBe(0)

  await selectTab(owner, roomId)
  await renameCurrentTab(owner, 'Renamed by its owner')

  await expect.poll(() => tabNames(member), {
    message: 'the owner\'s rename never reached the member',
  }).toContain('Renamed by its owner')
  expect(await renameAffordance(member).count()).toBe(0)
})
