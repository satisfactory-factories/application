import type { APIRequestContext, Page } from '@playwright/test'

import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { installWsGate } from '../helpers/network'
import type { WsGate } from '../helpers/network'
import { showPlan } from '../helpers/rooms'
import type { ClientFactory } from '../helpers/rooms'
import {
  addImport,
  addLocalTab,
  addNamedFactory,
  addProduct,
  clickTab,
  createSyncedTab,
  expectConverged,
  expectQuiesced,
  loadingOverlay,
  mirroredFactories,
  openPlanner,
  selectTab,
  setFactoryNote,
  settle,
} from '../helpers/planner'

/**
 * A client rendering a plan must not write to it. The staggered loader empties the tab's
 * factory array and refills it one record at a time, so for a second or more the plan on
 * that client is a fragment — and every path that read the fragment wrote it back and
 * then reported the missing records to the server as deletions. The other client's engine
 * then tripped over references to factories that no longer existed.
 *
 * Every case here is the same shape: one client renders, the other edits, and the wire is
 * read directly. `sent()` is the assertion that matters — a plan that survives because the
 * removals happened to be corrected afterwards has still been broken for everyone else.
 */

/** Over PACED_RENDER_FACTORY_COUNT (10), so opening this plan always stages a real chain. */
const PLAN_SIZE = 15

const SOURCE = 'Source'
const CONSUMER = 'Consumer'

const planNames = (): string[] =>
  Array.from({ length: PLAN_SIZE }, (_, index) =>
    index === 0 ? SOURCE : index === PLAN_SIZE - 1 ? CONSUMER : `Filler ${index + 1}`)

/**
 * A plan big enough to need pacing, ending in a factory that imports from the first one.
 * That import is what makes a truncation *visible*: the engine resolves every input by
 * factory id, so a plan whose producer has gone raises "Factory not found" and the
 * corruption alert on whoever receives it.
 *
 * The source extracts its own ore deliberately. A plan short of a raw resource raises the
 * migration notice at the end of every load, and that notice is a modal over the whole
 * page — a second thing to fail, and nothing to do with what is under test.
 */
const seedBigPlan = async (page: Page): Promise<string[]> => {
  const names = planNames()
  for (const name of names) await addNamedFactory(page, name)

  await addProduct(page, 0, 'Iron Ore')
  await addProduct(page, PLAN_SIZE - 1, 'Iron Ingot')
  await addImport(page, PLAN_SIZE - 1, SOURCE, 'Iron Ore')
  return names
}

const removalsSentBy = (gate: WsGate): number[] =>
  gate.sent()
    .filter(frame => frame.type === 'op')
    .flatMap(frame => (frame.diff as { removedFactoryIds?: number[] })?.removedFactoryIds ?? [])

/** Every alert the app raised. The corruption notice is one, and it must never fire. */
const watchAlerts = (page: Page): string[] => {
  const seen: string[] = []
  page.on('dialog', dialog => {
    seen.push(dialog.message())
    void dialog.dismiss()
  })
  return seen
}

interface Scene {
  roomId: string
  names: string[]
  owner: Page
  renderer: Page
  gate: WsGate
  alerts: string[]
}

/**
 * The owner with the plan, and a second device on the same account holding it too. The
 * gate sits on the second device, which is the one that will be mid-render.
 */
const twoDevicesOnABigPlan = async (
  client: ClientFactory,
  request: APIRequestContext,
): Promise<Scene> => {
  const user = await registerUser(request)
  const owner = await openPlanner(await client({ user }))
  const alerts = watchAlerts(owner)

  const roomId = await createSyncedTab(owner)
  const names = await seedBigPlan(owner)
  await expectQuiesced([owner], roomId)

  let gate: WsGate | undefined
  const renderer = await openPlanner(await client({ user }), '/', async page => {
    gate = await installWsGate(page)
  })
  await showPlan(renderer, user, roomId)
  await selectTab(renderer, roomId)
  await expect(renderer.locator('input.factory-name')).toHaveCount(PLAN_SIZE, { timeout: 30_000 })
  await expectConverged([owner, renderer], roomId)
  await expect(
    renderer.locator('#raw-notice-dismiss'),
    'the raw-resources notice is covering the planner, and it would swallow every click',
  ).toHaveCount(0)

  return { roomId, names, owner, renderer, gate: gate as WsGate, alerts }
}

/**
 * The whole point, asserted the same way every time: nobody was told the plan shrank,
 * both devices hold all of it, and no engine anywhere hit a dangling reference.
 */
const expectNothingWasDeleted = async (scene: Scene): Promise<void> => {
  await expectQuiesced([scene.owner, scene.renderer], scene.roomId)

  for (const page of [scene.owner, scene.renderer]) {
    expect(
      (await mirroredFactories(page, scene.roomId)).map(factory => factory.name),
      'a device ended up holding less than the whole plan',
    ).toEqual(scene.names)
  }

  expect(
    removalsSentBy(scene.gate),
    'the rendering client told the server those factories had been deleted',
  ).toEqual([])
  expect(scene.alerts, 'the owner was shown an alert').toEqual([])
}

/**
 * One of the app's own top-level tabs. Polled from the driver rather than through
 * `waitForFunction`, whose default polling rides the page's animation frames — and a
 * browser window sitting behind another one does not get many of those.
 */
const goTo = async (page: Page, path: string): Promise<void> => {
  await page.locator(`a.v-tab[href="${path}"]`).click()
  await expect.poll(() => new URL(page.url()).pathname, {
    message: `the ${path} tab never navigated`,
  }).toBe(path)
}

/**
 * The edit the owner makes while the other device is still putting cards on screen. The
 * wait puts the fan-out inside the stagger: the chain mounts one record every 75ms and a
 * note costs a debounce plus a round trip, so anything under half a second lands early in
 * a fifteen-record chain. A slower machine only makes the window wider.
 */
const editDuringTheRender = async (scene: Scene, note: string, delay = 300): Promise<void> => {
  await expect(loadingOverlay(scene.renderer), 'the tab rendered without pacing itself')
    .toBeVisible()
  await scene.renderer.waitForTimeout(delay)
  await setFactoryNote(scene.owner, 0, note)
}

test('re-entering a big tab makes no writes while it renders', async ({ client, request }) => {
  test.slow()
  const scene = await twoDevicesOnABigPlan(client, request)

  // A tab to leave to, then back: the return is what stages the chain.
  await addLocalTab(scene.renderer)
  await clickTab(scene.renderer, scene.roomId)

  await editDuringTheRender(scene, 'edited while the other device was still rendering')
  await settle(scene.renderer)

  await expectNothingWasDeleted(scene)
})

/**
 * The variant that made this so destructive in the field. Touched ids are persisted, so a
 * client with unsent edits carries a set of them into its next boot — and the rebase reads
 * "touched, and not in local state" as this client having deleted the record. Every
 * factory the stagger has not reached yet answers that description.
 */
test('a client with unsent edits makes no writes while it renders', async ({ client, request }) => {
  test.slow()
  const scene = await twoDevicesOnABigPlan(client, request)
  const held = 'written before the other device came back to this tab'

  /**
   * The last records in the plan, because the stagger mounts them last: the overlay reads
   * "touched, and not in local state" as this client having deleted the record, and a
   * factory the chain has not reached yet answers that description exactly. Swallowed
   * rather than sent, so the edits are still outstanding — which is what sends the inbound
   * op down the rebase path rather than the plain apply.
   */
  const swallowed = scene.gate.holdOps()
  for (let index = PLAN_SIZE - 5; index < PLAN_SIZE; index++) {
    await setFactoryNote(scene.renderer, index, held)
  }
  await swallowed

  await addLocalTab(scene.renderer)
  await clickTab(scene.renderer, scene.roomId)

  await editDuringTheRender(scene, 'edited while the other device was still rendering', 150)
  // Opened again before the chain ends: the resend the rebase makes has to reach the
  // server, and the hold would swallow that one too and leave the client stuck.
  scene.gate.restore()
  await settle(scene.renderer)

  await expectNothingWasDeleted(scene)
  // Parking is not dropping: the edits it was holding still get there.
  await expect.poll(async () =>
    (await mirroredFactories(scene.owner, scene.roomId)).at(-1)?.notes,
  { timeout: 30_000, message: 'the held edits never reached the owner' },
  ).toBe(held)
})

/**
 * Navigating away from the planner unmounts it, and coming back mounts it again — which
 * asks for the plan again and stages another chain. That chain used to run without the app
 * ever saying it was loading, so nothing anywhere knew the array was a fragment.
 */
test('returning to the planner from another page makes no writes while it renders', async ({
  client,
  request,
}) => {
  test.slow()
  const scene = await twoDevicesOnABigPlan(client, request)

  await goTo(scene.renderer, '/parts')
  await goTo(scene.renderer, '/')

  await editDuringTheRender(scene, 'edited while the other device came back to the planner')
  await settle(scene.renderer)

  await expectNothingWasDeleted(scene)
})
