import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { installWsGate } from '../helpers/network'
import type { WsGate } from '../helpers/network'
import {
  addFactory,
  createSyncedTab,
  expectQuiesced,
  factoryNames,
  openPlanner,
  renameFactory,
  selectTab,
} from '../helpers/planner'

test('a dropped connection offers offline mode, and nothing edited in it is lost', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const context = await client({ user })

  let gate!: WsGate
  const first = await openPlanner(context, '/', async page => { gate = await installWsGate(page) })
  const roomId = await createSyncedTab(first)

  const second = await openPlanner(await client({ user }))
  await selectTab(second, roomId)

  // An op that is genuinely in flight when the link dies: sent by the client,
  // never delivered, and about to be abandoned with the socket.
  const inFlight = gate.holdOps()
  await addFactory(first, { name: 'In flight', note: 'sent but never acknowledged' })
  await inFlight
  await gate.kill()

  const prompt = first.getByTestId('offline-prompt')
  await expect(prompt).toBeVisible({ timeout: 30_000 })
  await expect(prompt).toContainText('You appear to be offline')
  await expect(prompt).toContainText('Your data will sync when you\'re back online')
  await expect(prompt).toContainText('Go into offline mode?')

  await first.getByTestId('offline-accept').click()
  await expect(first.getByTestId('offline-indicator')).toBeVisible()

  await addFactory(first, { name: 'Made offline', note: 'added after accepting the prompt' })

  gate.restore()
  await first.getByTestId('offline-exit').click()

  // Both survive: the one the drop swallowed and the one made while silent.
  await expect.poll(() => factoryNames(second), {
    timeout: 30_000,
    message: 'the edits made across the outage never reached the other device',
  }).toEqual(['In flight', 'Made offline'])
  await expectQuiesced([first, second], roomId)
})

/**
 * A rename carries no structural signal — the factory exists on both sides either way — so
 * it survives only because the name field records it as intent. The other device moves the
 * room on during the outage, which makes the reconnect a snapshot and a rebase rather than
 * a plain resend, and a rebase carries over nothing it was not told the user touched.
 */
test('a rename left unsent by a dropped connection survives the reconnect', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const context = await client({ user })

  let gate!: WsGate
  const first = await openPlanner(context, '/', async page => { gate = await installWsGate(page) })
  const roomId = await createSyncedTab(first)
  await addFactory(first, { name: 'Smelters', note: 'made while online' })

  const second = await openPlanner(await client({ user }))
  await selectTab(second, roomId)
  await expect(second.locator('input.factory-name')).toHaveValue('Smelters')

  // Held rather than merely quick: the rename is provably still unsent when the link dies.
  const held = gate.holdOps()
  await renameFactory(first, 0, 'Steel Beams')
  await held
  await gate.kill()

  // The room moves on without us, so the reconnect cannot simply replay what we hold.
  await addFactory(second, { name: 'Constructors', note: 'added during the outage' })
  await expect.poll(() => factoryNames(second)).toEqual(['Smelters', 'Constructors'])

  gate.restore()

  for (const page of [first, second]) {
    await expect.poll(() => factoryNames(page), {
      timeout: 40_000,
      message: 'the rename and the other device\'s addition did not both survive',
    }).toEqual(['Steel Beams', 'Constructors'])
  }
  await expectQuiesced([first, second], roomId)
})
