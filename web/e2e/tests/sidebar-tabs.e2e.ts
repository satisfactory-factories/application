import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import {
  addFactory,
  addLocalTab,
  addNamedFactory,
  clickTab,
  createSyncedTab,
  expectQuiesced,
  expectSidebarLists,
  loadingOverlay,
  openPlanner,
  selectTab,
  waitForTab,
} from '../helpers/planner'
import { shareARoom } from '../helpers/rooms'

/**
 * The docked sidebar is the plan's table of contents, and it has gone blank
 * twice on load paths that skipped the old staggered loader. It is also the only place
 * the whole plan is listed, since the planner pane shows one factory at a time. Every assertion here is
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

/**
 * The planner shows one factory at a time, so a plan of any size opens without a loader and
 * puts exactly one card on screen: the factory that was open when the tab was last left.
 */
test('opening a big tab needs no loader, and reopens the factory left open there', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client({ user }))
  const overlay = loadingOverlay(page)
  const cards = page.locator('.main-content .factory-card:not(.sub-card)')

  const small = await createSyncedTab(page)
  await addFactory(page, { name: 'Small One', note: 'the only one here' })

  const big = await createSyncedTab(page)
  const bigNames: string[] = []
  for (let index = 1; index <= 15; index++) {
    bigNames.push(`Big ${index}`)
    await addNamedFactory(page, `Big ${index}`)
  }
  await expectQuiesced([page], big)

  for (const [tab, names, open] of [
    [small, ['Small One'], 'Small One'],
    [big, bigNames, 'Big 15'],
  ] as const) {
    await clickTab(page, tab)
    // Sampled rather than checked once: a whole window of clear samples is what says the
    // loading screen never came back for a tab switch.
    for (let sample = 0; sample < 6; sample++) {
      expect(await overlay.count(), 'the tab raised a loader it does not need').toBe(0)
      await page.waitForTimeout(50)
    }
    await expectSidebarLists(page, [...names])
    await expect(cards).toHaveCount(1)
    await expect(cards.locator('input.factory-name')).toHaveValue(open)
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
