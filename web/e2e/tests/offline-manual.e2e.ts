import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { installWsGate, watchApiRequests } from '../helpers/network'
import type { WsGate } from '../helpers/network'
import {
  addFactory,
  createSyncedTab,
  expectQuiesced,
  factoryNames,
  openPlanner,
  selectTab,
} from '../helpers/planner'
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
