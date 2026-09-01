import { expect } from '@playwright/test'
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'

import { registerUser, type TestUser } from './accounts'
import { addFactory, createSyncedTab, openPlanner, selectTab, settle, waitForTab } from './planner'
import { closeAccountPanel, openAccountPanel } from './session'

export type ClientFactory = (options?: { user?: TestUser }) => Promise<BrowserContext>

/**
 * Opens an account plan into this device's tab bar through the panel's Show
 * button. The tab bar is the per-browser open set now, so a room made or joined
 * elsewhere never opens a tab here on its own — this is how a device opts in.
 * Ensure-open: a plan already opened (say, by the login chooser) is left be.
 */
export const showPlan = async (page: Page, user: TestUser, roomId: string): Promise<void> => {
  await openAccountPanel(page, user)
  await page.getByTestId('plans-tab-cloud').click()
  const show = page.locator(`[data-testid="show-plan"][data-room-id="${roomId}"]`)
  const hide = page.locator(`[data-testid="hide-plan"][data-room-id="${roomId}"]`)
  await expect(show.or(hide)).toBeVisible()
  if (await show.isVisible()) await show.click()
  await waitForTab(page, roomId)
  // Settled before the Escape: the loading overlay is persistent, and while it
  // is the topmost overlay the tray would swallow no keystrokes.
  await settle(page)
  await closeAccountPanel(page)
}

/** The other direction: closes the plan's tab here without touching the account. */
export const hidePlan = async (page: Page, user: TestUser, roomId: string): Promise<void> => {
  await openAccountPanel(page, user)
  await page.getByTestId('plans-tab-cloud').click()
  await page.locator(`[data-testid="hide-plan"][data-room-id="${roomId}"]`).click()
  await expect(page.locator(`[data-testid="show-plan"][data-room-id="${roomId}"]`)).toBeVisible()
  await settle(page)
  await closeAccountPanel(page)
}

export interface SyncedPair {
  user: TestUser
  roomId: string
  first: Page
  second: Page
}

/** One account, one synced tab, two devices both looking at it. */
export const syncedPair = async (
  client: ClientFactory,
  request: APIRequestContext,
  /** Factories the first device seeds before the second one joins. */
  seed: string[] = [],
): Promise<SyncedPair> => {
  const user = await registerUser(request)

  const first = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(first)
  for (const name of seed) await addFactory(first, { name, note: `seeded ${name}` })

  // A second device opens with only its own local tab: account rooms stay
  // hidden until this browser opts in, which is what the panel's Show does.
  const second = await openPlanner(await client({ user }))
  await showPlan(second, user, roomId)
  await selectTab(second, roomId)
  await expect(second.locator('input.factory-name')).toHaveCount(seed.length, { timeout: 20_000 })

  return { user, roomId, first, second }
}

export const openShareDialog = async (page: Page): Promise<void> => {
  await page.getByTestId('share-button').click()
  await expect(page.getByTestId('share-dialog')).toBeVisible()
}

/** The shared dialog shell puts the way out in the corner, reachable by its id. */
export const closeShareDialog = async (page: Page): Promise<void> => {
  await page.locator('#close-share-dialog').click()
  await expect(page.getByTestId('share-dialog')).toBeHidden()
}

/** Turns the current tab into a collaborative one and hands back the invite link. */
export const createInviteLink = async (page: Page): Promise<string> => {
  await openShareDialog(page)
  await page.getByTestId('create-invite').click()

  const field = page.getByTestId('invite-link').locator('input')
  await expect(field).not.toHaveValue('')
  const link = await field.inputValue()

  await closeShareDialog(page)
  return link
}

/** The other half of the dialog: a frozen copy of the current tab, for anyone. */
export const createSnapshotLink = async (page: Page): Promise<string> => {
  await openShareDialog(page)
  await page.getByTestId('create-snapshot').click()

  const field = page.getByTestId('snapshot-link').locator('input')
  await expect(field).not.toHaveValue('')
  const link = await field.inputValue()

  await closeShareDialog(page)
  return link
}

/** Sets or rotates the invite password. Both are the same control and the same write. */
export const setInvitePassword = async (page: Page, password: string): Promise<void> => {
  await openShareDialog(page)
  const field = page.getByTestId('password-input').locator('input')
  await field.fill(password)
  await page.getByTestId('set-password').click()

  // The dialog clears the field only once the server has taken it, which is the
  // one receipt that reads the same for a first set and for a rotation.
  await expect(field).toHaveValue('')
  await expect(page.getByTestId('remove-password')).toBeVisible()
  await closeShareDialog(page)
}

/** Opens an invite link without assuming it lands on the planner. */
export const openInvite = async (
  context: BrowserContext,
  invitePath: string,
): Promise<Page> => {
  const page = await context.newPage()
  await page.goto(invitePath)
  return page
}

export const submitInvitePassword = async (page: Page, password: string): Promise<void> => {
  await expect(page.getByTestId('room-password')).toBeVisible()
  await page.getByTestId('room-password-input').locator('input').fill(password)
  await page.getByTestId('room-password-submit').click()
}

export const stopSharing = async (page: Page): Promise<void> => {
  await openShareDialog(page)
  await page.getByTestId('stop-sharing').click()
  // Back to the pre-share state: the invite half offers to create a link again.
  await expect(page.getByTestId('create-invite')).toBeVisible()
  await closeShareDialog(page)
}

export interface SharedRoom {
  user: TestUser
  roomId: string
  owner: Page
  invitePath: string
}

/** One account, one synced tab, shared, with the invite path ready to open. */
export const shareARoom = async (
  client: ClientFactory,
  request: APIRequestContext,
): Promise<SharedRoom> => {
  const user = await registerUser(request)
  const owner = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(owner)
  const link = await createInviteLink(owner)

  return { user, roomId, owner, invitePath: new URL(link).pathname }
}
