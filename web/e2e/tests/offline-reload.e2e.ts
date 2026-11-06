import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { watchApiRequests } from '../helpers/network'
import {
  addFactory,
  createSyncedTab,
  expectFactoryNames,
  expectQuiesced,
  factoryNames,
  openPlanner,
  selectTab,
  settle,
} from '../helpers/planner'
import { showPlan } from '../helpers/rooms'
import { setOfflineMode } from '../helpers/session'

/** Long enough for the boot sequence to have asked the server anything it was going to. */
const QUIET_MS = 5_000

/**
 * Offline mode is remembered, so a reload keeps it: the page opens silent, offers the way back
 * online once per tab session, and an edit made before taking that offer still reaches the room.
 */
test('offline mode survives a reload, offers the way back once, and loses nothing', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const context = await client({ user })

  const first = await openPlanner(context)
  const roomId = await createSyncedTab(first)
  await addFactory(first, { name: 'Baseline', note: 'made while online' })

  const second = await openPlanner(await client({ user }))
  await showPlan(second, user, roomId)
  await selectTab(second, roomId)
  await expectFactoryNames(second, ['Baseline'])

  await setOfflineMode(first, user, true)

  const traffic = watchApiRequests(context)
  await first.reload()
  await settle(first)

  const prompt = first.getByTestId('offline-return-prompt')
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('You\'re still in offline mode')
  await expect(first.getByTestId('tab-bar-offline')).toContainText('Offline mode')

  // The reload itself asked the server nothing: not the session, not the version, not the room.
  await first.waitForTimeout(QUIET_MS)
  expect(traffic.urls()).toEqual([])

  await addFactory(first, { name: 'Made after reload', note: 'made before going back online' })
  expect(await factoryNames(second)).toEqual(['Baseline'])

  await first.getByTestId('offline-return-accept').click()
  await expect(prompt).toBeHidden()

  await expectFactoryNames(second, ['Baseline', 'Made after reload'], { timeout: 30_000 })
  await expectQuiesced([first, second], roomId)

  // Once per tab session: back into offline mode and reloaded again, it does not ask twice.
  await setOfflineMode(first, user, true)
  await first.reload()
  await settle(first)
  await expect(first.getByTestId('tab-bar-offline')).toContainText('Offline mode')
  await first.waitForTimeout(2_000)
  await expect(prompt).toBeHidden()

  // A fresh tab session is owed the reminder again.
  const fresh = await context.newPage()
  await fresh.goto('/')
  await settle(fresh)
  await expect(fresh.getByTestId('offline-return-prompt')).toBeVisible()
})
