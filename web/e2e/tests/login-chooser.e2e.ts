import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import {
  addFactory,
  createSyncedTab,
  expectConverged,
  expectTabKind,
  mirroredFactories,
  openPlanner,
  outstandingIntent,
  settle,
  tabNames,
} from '../helpers/planner'
import { openAccountPanel, signIn } from '../helpers/session'

/**
 * The login chooser: an interactive sign-in against an account with unopened
 * plans is fronted by a dialog. "Not now" leaves every one of them off this
 * browser; the open-all answer brings them down whole, and they keep coming
 * down on every later visit for as long as they are not hidden again.
 */
test('"Not now" leaves the account plan hidden, and a reload never re-asks', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)

  // The first device runs on a seeded session (a persisted token, no sign-in),
  // which is itself the refresh path: no chooser fronts its planner either.
  const first = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(first)
  await addFactory(first, { name: 'Cloud only', note: 'made on the first device' })

  // A fresh browser signs in interactively and declines the chooser.
  const second = await openPlanner(await client())
  await signIn(second, user, { chooser: 'not-now' })

  // Nothing opened: the bar still holds only this browser's own tab.
  expect(await tabNames(second)).toEqual(['Default'])

  // A reload is a persisted session, not a sign-in: the chooser must not return.
  await second.reload()
  await settle(second)
  await expect(second.getByTestId('plan-chooser-dialog')).toBeHidden()
  expect(await tabNames(second)).toEqual(['Default'])

  // The plan is untouched on the account, waiting behind the panel's Show button.
  await openAccountPanel(second, user)
  await second.getByTestId('plans-tab-cloud').click()
  await expect(second.locator(`[data-testid="show-plan"][data-room-id="${roomId}"]`)).toBeVisible()
})

/**
 * The other half of the same journey, and the one a user calls "my plans follow
 * my account": machine A makes the cloud plans, machine B has never seen the
 * account, and signing in there brings them down whole with no further asking.
 */
test('a fresh device signs in and every plan it opens downloads whole', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)

  // Machine A: two cloud plans, each with authored content behind it.
  const machineA = await openPlanner(await client({ user }))
  const backbone = await createSyncedTab(machineA)
  await addFactory(machineA, { name: 'Iron backbone', note: 'made on machine A' })
  const spur = await createSyncedTab(machineA)
  await addFactory(machineA, { name: 'Copper spur', note: 'also machine A' })

  // Machine B: a browser holding nothing but its own empty local tab. The
  // sign-in is all the user does; the chooser opens every plan by default.
  const machineB = await openPlanner(await client())
  await signIn(machineB, user)

  await expect.poll(() => tabNames(machineB).then(names => names.length), {
    message: 'the chooser never opened the account plans here',
  }).toBe(3)
  await expectTabKind(machineB, backbone, 'synced')
  await expectTabKind(machineB, spur, 'synced')

  // Both plans arrive, including the one machine B never selected: opening a
  // plan joins its room, and the join fills the tab whether it is on screen or
  // not. Converged is the strong form: same revision and the same bytes.
  for (const [roomId, factory] of [[backbone, 'Iron backbone'], [spur, 'Copper spur']] as const) {
    await expect.poll(
      async () => (await mirroredFactories(machineB, roomId)).map(entry => entry.name),
      { message: `"${factory}" never reached the new device` },
    ).toEqual([factory])
    await expectConverged([machineA, machineB], roomId)
  }
})

test('a plan already open on a device catches up on what it missed, unprompted', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)

  const machineA = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(machineA)
  await addFactory(machineA, { name: 'Before the trip', note: 'made on machine A' })

  const deviceB = await client()
  let machineB = await openPlanner(deviceB)
  await signIn(machineB, user)
  await expect.poll(
    async () => (await mirroredFactories(machineB, roomId)).map(entry => entry.name),
    { message: 'the plan never reached the new device' },
  ).toEqual(['Before the trip'])

  // Machine B is put away for the night; machine A carries on without it.
  await machineB.close()
  await addFactory(machineA, { name: 'While away', note: 'machine A kept going' })
  await expect.poll(() => outstandingIntent(machineA, roomId), {
    message: 'machine A never got its edit onto the server',
  }).toBe(0)

  // Coming back is a page load with a persisted session, not a sign-in: no
  // chooser fronts it, and the tab left open refills itself with nothing
  // clicked. A plan that is not hidden is a plan this device keeps downloading.
  machineB = await openPlanner(deviceB)
  await expect(machineB.getByTestId('plan-chooser-dialog')).toBeHidden()
  await expect.poll(
    async () => (await mirroredFactories(machineB, roomId)).map(entry => entry.name),
    { message: 'the open tab never caught up with what it missed' },
  ).toEqual(['Before the trip', 'While away'])
  await expectConverged([machineA, machineB], roomId)
})
