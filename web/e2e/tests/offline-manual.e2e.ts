import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { installWsGate, watchApiRequests } from '../helpers/network'
import type { WsGate } from '../helpers/network'
import {
  addFactory,
  addTask,
  createSyncedTab,
  expectQuiesced,
  factoryNames,
  mirroredTasks,
  openPlanner,
  selectTab,
} from '../helpers/planner'
import { showPlan } from '../helpers/rooms'
import { setOfflineMode } from '../helpers/session'

/**
 * Long enough to outlast everything the client sends on a timer: the 400ms op
 * debounce, the 2s preference poll and the 1s push debounce behind it. "Zero
 * requests" is only worth asserting once those have all had their chance.
 */
const QUIET_MS = 5_000

test('offline mode is silent, and the edits made in it sync on the way back', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const context = await client({ user })

  let gate!: WsGate
  const first = await openPlanner(context, '/', async page => { gate = await installWsGate(page) })
  const roomId = await createSyncedTab(first)
  await addFactory(first, { name: 'Baseline', note: 'made while online' })

  const second = await openPlanner(await client({ user }))
  await showPlan(second, user, roomId)
  await selectTab(second, roomId)
  await expect(second.locator('input.factory-name')).toHaveValue('Baseline')

  const traffic = watchApiRequests(context)
  await setOfflineMode(first, user, true)

  const socketsBefore = gate.connections()
  traffic.reset()

  await addFactory(first, { name: 'Offline addition', note: 'made with the switch on' })
  await first.waitForTimeout(QUIET_MS)

  expect(traffic.urls()).toEqual([])
  expect(gate.connections()).toBe(socketsBefore)
  await expect(first.getByTestId('tab-bar-offline')).toBeVisible()
  // The other device saw nothing, because nothing was sent.
  expect(await factoryNames(second)).toEqual(['Baseline'])

  await setOfflineMode(first, user, false)

  await expect(second.locator('input.factory-name').nth(1))
    .toHaveValue('Offline addition', { timeout: 20_000 })
  await expectQuiesced([first, second], roomId)
})

/**
 * A task list changes no calculation and adds no factory, so the way out of offline mode
 * keeps it only because the tasks card recorded the edit as intent. The other device moves
 * the room on meanwhile, so the exit is a rebase onto server state rather than a replay.
 */
test('a task added in offline mode survives the way back out', async ({ client, request }) => {
  const user = await registerUser(request)

  const first = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(first)
  await addFactory(first, { name: 'Smelters', note: 'made while online' })

  const second = await openPlanner(await client({ user }))
  await showPlan(second, user, roomId)
  await selectTab(second, roomId)
  await expect(second.locator('input.factory-name')).toHaveValue('Smelters')

  await setOfflineMode(first, user, true)
  await addTask(first, 0, 'Build the smelters')

  await addFactory(second, { name: 'Constructors', note: 'added while the first was silent' })
  await expect.poll(() => factoryNames(second)).toEqual(['Smelters', 'Constructors'])

  await setOfflineMode(first, user, false)

  for (const page of [first, second]) {
    await expect.poll(() => mirroredTasks(page, roomId, 'Smelters'), {
      timeout: 30_000,
      message: 'the task written offline never survived the exit',
    }).toEqual(['Build the smelters'])
  }
  await expectQuiesced([first, second], roomId)
})
