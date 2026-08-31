import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import {
  addFactory,
  addLocalTab,
  createSyncedTab,
  expectQuiesced,
  expectSidebarLists,
  openPlanner,
  selectTab,
  waitForTab,
} from '../helpers/planner'
import { shareARoom } from '../helpers/rooms'

/**
 * The docked sidebar is the plan's table of contents, and it has gone blank
 * twice on load paths that skipped the staggered loader. Every assertion here is
 * `toBeVisible` on the rows themselves rather than a count or a stored read: a
 * list rendered into a hidden sidebar is the exact failure.
 */

test('the sidebar lists the active tab across repeated switches between two synced tabs', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client({ user }))

  const alpha = await createSyncedTab(page)
  await addFactory(page, { name: 'Alpha One', note: 'first of alpha' })
  await addFactory(page, { name: 'Alpha Two', note: 'second of alpha' })

  const beta = await createSyncedTab(page)
  await addFactory(page, { name: 'Beta One', note: 'only one of beta' })

  // Three rounds: the first switch is the cheap one, and the bug showed up on a
  // later return to a tab whose plan the client already held.
  for (let round = 0; round < 3; round++) {
    await selectTab(page, alpha)
    await expectSidebarLists(page, ['Alpha One', 'Alpha Two'])

    await selectTab(page, beta)
    await expectSidebarLists(page, ['Beta One'])
  }
})

test('the sidebar lists a local tab the same way', async ({ client, request }) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client({ user }))

  const synced = await createSyncedTab(page)
  await addFactory(page, { name: 'Synced One', note: 'on the account' })

  await addLocalTab(page)
  await addFactory(page, { name: 'Local One', note: 'this browser only' })
  await expectSidebarLists(page, ['Local One'])

  await selectTab(page, synced)
  await expectSidebarLists(page, ['Synced One'])
})

test('the sidebar lists a joined room once its snapshot arrives', async ({ client, request }) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)
  await addFactory(owner, { name: 'Shared One', note: 'from the owner' })
  await addFactory(owner, { name: 'Shared Two', note: 'also from the owner' })
  // The joiner's snapshot is only worth checking once the server holds both. Not
  // a revision count: two adds inside one debounce window ship as a single op.
  await expectQuiesced([owner], roomId)

  const joinerUser = await registerUser(request)
  const joiner = await openPlanner(await client({ user: joinerUser }), invitePath)
  await waitForTab(joiner, roomId)
  await selectTab(joiner, roomId)

  await expectSidebarLists(joiner, ['Shared One', 'Shared Two'])

  // And it survives leaving the room's tab and coming back to it.
  const local = (await joiner.evaluate(id =>
    (JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as { id: string }[])
      .map(tab => tab.id).find(tabId => tabId !== id), roomId)) as string
  expect(local, 'the joiner has no local tab to switch away to').toBeTruthy()

  await selectTab(joiner, local)
  await selectTab(joiner, roomId)
  await expectSidebarLists(joiner, ['Shared One', 'Shared Two'])
})
