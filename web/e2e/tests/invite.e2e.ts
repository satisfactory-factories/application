import { expect, test } from '../helpers/fixtures'
import { registerUser, unique } from '../helpers/accounts'
import {
  addFactory,
  expectTabKind,
  factoryNames,
  notesField,
  openPlanner,
  readTabBar,
  selectTab,
  waitForRevision,
} from '../helpers/planner'
import { shareARoom, showPlan } from '../helpers/rooms'

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

// A logged-in joiner holds a membership rather than a pointer in one browser, so
// the plan follows the account: their other device lists it under Joined Plans
// and opens it from there. No tab appears anywhere without that device asking.
test('a joined plan can be opened from the panel on the joiner\'s other device', async ({
  client,
  request,
}) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)
  const name = unique('Echo')
  await addFactory(owner, { name, note: `shared by its owner: ${name}` })
  await waitForRevision(owner, roomId, 1)

  const joiner = await registerUser(request)
  const first = await openPlanner(await client({ user: joiner }), invitePath)
  await expectTabKind(first, roomId, 'collaborative')

  const second = await openPlanner(await client({ user: joiner }))
  await showPlan(second, joiner, roomId)
  await expectTabKind(second, roomId, 'collaborative')

  await selectTab(second, roomId)
  await expect(second.locator('input.factory-name')).toHaveValue(name)
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
