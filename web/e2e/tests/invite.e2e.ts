import { expect, test } from '../helpers/fixtures'
import { unique } from '../helpers/accounts'
import {
  addFactory,
  factoryNames,
  notesField,
  openPlanner,
  readTabBar,
  waitForRevision,
} from '../helpers/planner'
import { shareARoom } from '../helpers/rooms'

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
