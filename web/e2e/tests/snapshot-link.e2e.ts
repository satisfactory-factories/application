import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import {
  addFactory,
  createSyncedTab,
  factoryNames,
  openPlanner,
  readTabBar,
  waitForRevision,
} from '../helpers/planner'
import { closeShareDialog, createSnapshotLink, openShareDialog } from '../helpers/rooms'

/**
 * The second of the two link types, and the one that must not have become live:
 * `/share/:id` is a copy taken at a moment, kept by whoever opens it.
 */
test('a snapshot link hands over a frozen local copy, not a seat in the room', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const owner = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(owner)

  await addFactory(owner, { name: 'As it stood', note: 'the state the link froze' })
  await waitForRevision(owner, roomId, 1)

  const link = await createSnapshotLink(owner)
  const visitor = await openPlanner(await client(), new URL(link).pathname)

  // The import lands as a tab of this browser's own, with the "(shared)" suffix
  // the page adds, and no account behind it.
  const imported = (await readTabBar(visitor)).at(-1)
  expect(imported).toEqual(expect.objectContaining({ kind: 'local' }))
  expect(imported?.name).toMatch(/\(shared\)$/)
  expect(await factoryNames(visitor)).toEqual(['As it stood'])

  // Frozen: the owner carries on and the copy stays where it was.
  await addFactory(owner, { name: 'Added afterwards', note: 'never in the snapshot' })
  await waitForRevision(owner, roomId, 2)

  await expect(visitor.locator('input.factory-name')).toHaveCount(1)
  expect(await factoryNames(visitor)).toEqual(['As it stood'])
})

/**
 * A snapshot is a dead copy, so a second one of identical bytes is two links to
 * the same thing. The dialog used to mint one every time it was opened.
 */
test('reopening the dialog on an unchanged plan hands back the same link', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const owner = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(owner)

  await addFactory(owner, { name: 'Frozen once', note: 'the state the link froze' })
  await waitForRevision(owner, roomId, 1)

  const first = await createSnapshotLink(owner)

  // Reopened on the same plan: the link is already there and there is nothing to press.
  await openShareDialog(owner)
  await expect(owner.getByTestId('snapshot-unchanged')).toBeVisible()
  await expect(owner.getByTestId('create-snapshot')).toBeHidden()
  expect(await owner.getByTestId('snapshot-link').locator('input').inputValue()).toBe(first)
  await closeShareDialog(owner)

  // An edit is what earns a new one, and it really is new.
  await addFactory(owner, { name: 'Changed since', note: 'so the next snapshot differs' })
  await waitForRevision(owner, roomId, 2)

  await openShareDialog(owner)
  await expect(owner.getByTestId('create-snapshot')).toBeVisible()
  await closeShareDialog(owner)

  const second = await createSnapshotLink(owner)
  expect(second).not.toBe(first)
})
