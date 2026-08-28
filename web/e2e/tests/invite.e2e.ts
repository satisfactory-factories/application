import type { APIRequestContext, BrowserContext, Page } from '@playwright/test'

import { expect, test } from '../helpers/fixtures'
import { registerUser, type TestUser, unique } from '../helpers/accounts'
import {
  addFactory,
  createSyncedTab,
  factoryNames,
  notesField,
  openPlanner,
  readTabBar,
  waitForRevision,
} from '../helpers/planner'

type ClientFactory = (options?: { user?: TestUser }) => Promise<BrowserContext>

/** Turns the current tab into a collaborative one and hands back the invite link. */
const createInviteLink = async (page: Page): Promise<string> => {
  await page.getByTestId('share-button').click()
  await expect(page.getByTestId('share-dialog')).toBeVisible()
  await page.getByTestId('create-invite').click()

  const field = page.getByTestId('invite-link').locator('input')
  await expect(field).not.toHaveValue('')
  const link = await field.inputValue()

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('share-dialog')).toBeHidden()
  return link
}

interface SharedRoom {
  roomId: string
  owner: Page
  invitePath: string
}

const shareARoom = async (
  client: ClientFactory,
  request: APIRequestContext,
): Promise<SharedRoom> => {
  const user = await registerUser(request)
  const owner = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(owner)
  const link = await createInviteLink(owner)

  return { roomId, owner, invitePath: new URL(link).pathname }
}

test('a logged-out visitor joining the invite link gets the owner\'s plan', async ({
  client,
  request,
}) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)

  const name = unique('Charlie')
  await addFactory(owner, { name, note: `shared by its owner: ${name}` })
  // The visitor's snapshot is only worth checking once the server actually holds it.
  await waitForRevision(owner, roomId, 1)

  // No account, no prior state: exactly what opening a pasted link looks like.
  const visitor = await openPlanner(await client(), invitePath)

  await expect(visitor.locator('input.factory-name')).toHaveValue(name)
  expect(await readTabBar(visitor)).toContainEqual(
    expect.objectContaining({ kind: 'collaborative', selected: true }),
  )
})

test('an edit by the visitor reaches the owner', async ({ client, request }) => {
  const { owner, invitePath } = await shareARoom(client, request)
  const visitor = await openPlanner(await client(), invitePath)

  const name = unique('Delta')
  const note = `written by a visitor: ${name}`
  await addFactory(visitor, { name, note })

  await expect(owner.locator('input.factory-name')).toHaveValue(name, { timeout: 5_000 })
  await expect(notesField(owner)).toHaveValue(note)
  expect(await factoryNames(owner)).toEqual([name])
})
