import type { APIRequestContext, Page } from '@playwright/test'

import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import type { TestUser } from '../helpers/accounts'
import { installWsGate } from '../helpers/network'
import type { WsGate } from '../helpers/network'
import { openAccountPanel, setOfflineMode } from '../helpers/session'
import { showPlan } from '../helpers/rooms'
import type { ClientFactory } from '../helpers/rooms'
import {
  addFactory,
  addProduct,
  authoredFactories,
  createSyncedTab,
  expectQuiesced,
  mirroredProductAmount,
  mirroredTabNamed,
  openPlanner,
  productAmountIn,
  readTabBar,
  selectTab,
  setFactoryNote,
  setProductAmount,
  settle,
  tabHolding,
} from '../helpers/planner'

/**
 * The offline clash: one device edits factories while it is cut off, somebody else edits the
 * same ones, and the two only meet when the device comes back. The prompt is what makes that
 * the user's decision instead of the engine's.
 */

const SEEDS = [
  { factory: 'Smelting', item: 'Iron Ingot', itemId: 'IronIngot', mine: 60, live: 90 },
  { factory: 'Casting', item: 'Copper Ingot', itemId: 'CopperIngot', mine: 45, live: 75 },
  // Edited on the away device only: nobody fought over it, so it is never asked about.
  { factory: 'Plating', item: 'Iron Plate', itemId: 'IronPlate', mine: 40, live: null },
]

const dialogOf = (page: Page) => page.getByTestId('offline-conflict-dialog')

const sectionFor = (page: Page, factory: string) =>
  page.getByTestId('conflict-factory').filter({ hasText: factory })

/**
 * The way back online, without closing the account tray. The prompt lands on top of it and
 * is deliberately persistent, so an Escape aimed at the tray would reach the dialog, do
 * nothing, and leave the tray open anyway.
 */
const comeBackOnline = async (page: Page, user: TestUser) => {
  await openAccountPanel(page, user)
  await page.getByTestId('offline-switch').locator('input').click()
  await expect(page.getByTestId('connection-chip')).toContainText('Connected', { timeout: 20_000 })
}

interface Diverged {
  user: TestUser
  roomId: string
  planName: string
  owner: Page
  away: Page
  /** Each side's plan as it stood before the two met, for checking what the answer kept. */
  liveBefore: Record<number, string>
  mineBefore: Record<number, string>
}

/** Two devices on one plan, edited apart while one of them could not reach the server. */
const divergeOffline = async (
  client: ClientFactory,
  request: APIRequestContext,
): Promise<Diverged> => {
  const user = await registerUser(request)

  const owner = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(owner)
  for (const [index, seed] of SEEDS.entries()) {
    await addFactory(owner, { name: seed.factory, note: `seeded ${seed.factory}` })
    await addProduct(owner, index, seed.item)
  }

  let gate!: WsGate
  const away = await openPlanner(await client({ user }), '/', async page => {
    gate = await installWsGate(page)
  })
  await showPlan(away, user, roomId)
  await selectTab(away, roomId)
  await expect(away.locator('input.factory-name')).toHaveCount(SEEDS.length, { timeout: 20_000 })
  await expectQuiesced([owner, away], roomId)

  // The outage happens at a moment the test picks; offline mode then stops the retrying, so
  // the way back is one switch rather than a backoff nobody can time.
  await gate.kill()
  await setOfflineMode(away, user, true)

  // The note goes with the rate: a factory carries more than its products, and a winner
  // that took one and left the other would be a half-merged record.
  for (const [index, seed] of SEEDS.entries()) {
    await setProductAmount(away, index, seed.itemId, seed.mine)
    await setFactoryNote(away, index, `away wrote ${seed.factory}`)
  }

  for (const [index, seed] of SEEDS.entries()) {
    if (seed.live === null) continue
    await setProductAmount(owner, index, seed.itemId, seed.live)
    await setFactoryNote(owner, index, `owner wrote ${seed.factory}`)
    await expect.poll(() => mirroredProductAmount(owner, roomId, seed.factory, seed.itemId), {
      message: `the owner's edit to ${seed.factory} never reached the server`,
      timeout: 30_000,
    }).toBe(seed.live)
  }

  const liveBefore = await authoredFactories(owner, roomId)
  const mineBefore = await authoredFactories(away, roomId)

  gate.restore()
  await comeBackOnline(away, user)

  const planName = (await readTabBar(away)).find(tab => tab.id === roomId)?.name ?? ''
  expect(planName, 'the synced tab has no name to copy').not.toBe('')

  return { user, roomId, planName, owner, away, liveBefore, mineBefore }
}

/** The two sections, with the figures a person would need to choose between. */
const expectTheClashIsShown = async (away: Page) => {
  await expect(dialogOf(away)).toBeVisible()
  await expect(away.getByTestId('conflict-factory')).toHaveCount(2)

  for (const seed of SEEDS) {
    if (seed.live === null) continue
    const section = sectionFor(away, seed.factory)
    await expect(section.getByTestId('evidence-live')).toContainText(`live: ${seed.live}/min`)
    await expect(section.getByTestId('evidence-mine')).toContainText(`mine: ${seed.mine}/min`)
  }
  await expect(sectionFor(away, 'Plating')).toHaveCount(0)
}

test('offline edits win when this device says so, and nothing else is disturbed', async ({
  client,
  request,
}) => {
  const { roomId, planName, owner, away } = await divergeOffline(client, request)

  await expectTheClashIsShown(away)

  for (const seed of SEEDS.filter(entry => entry.live !== null)) {
    await sectionFor(away, seed.factory).getByTestId('winner-mine').click()
  }
  const keptCopy = away.getByTestId('kept-copy').locator('input')
  await keptCopy.click()
  await expect(keptCopy).not.toBeChecked()

  await away.getByTestId('apply-choices').click()
  await expect(dialogOf(away)).toBeHidden()
  await settle(away)

  await expectQuiesced([owner, away], roomId)
  for (const page of [owner, away]) {
    for (const seed of SEEDS) {
      expect(await mirroredProductAmount(page, roomId, seed.factory, seed.itemId)).toBe(seed.mine)
    }
  }

  expect(
    await mirroredTabNamed(away, `${planName} (offline copy)`),
    'a copy was kept even though the box was cleared',
  ).toBeUndefined()
})

test('a mixed answer is honoured factory by factory, and the copy keeps what was given up', async ({
  client,
  request,
}) => {
  const { roomId, planName, owner, away, liveBefore, mineBefore } =
    await divergeOffline(client, request)

  await expectTheClashIsShown(away)

  // One each way: this device keeps Smelting, the live plan keeps Casting.
  await sectionFor(away, 'Smelting').getByTestId('winner-mine').click()
  await sectionFor(away, 'Casting').getByTestId('winner-live').click()
  await expect(away.getByTestId('kept-copy').locator('input')).toBeChecked()

  await away.getByTestId('apply-choices').click()
  await expect(dialogOf(away)).toBeHidden()
  await settle(away)

  await expectQuiesced([owner, away], roomId)
  const expected = { Smelting: 60, Casting: 75, Plating: 40 }
  for (const page of [owner, away]) {
    for (const seed of SEEDS) {
      expect(
        await mirroredProductAmount(page, roomId, seed.factory, seed.itemId),
        `${seed.factory} did not land on the chosen version`,
      ).toBe(expected[seed.factory as keyof typeof expected])
    }
  }

  // Whole factories, never a merge of two: every record is one side's, entire.
  const chosen = { Smelting: mineBefore, Casting: liveBefore, Plating: mineBefore }
  const merged = await authoredFactories(away, roomId)
  for (const seed of SEEDS) {
    const id = Number(Object.keys(merged).find(key =>
      merged[Number(key)].includes(`"name":"${seed.factory}"`)))
    expect(merged[id], `${seed.factory} is a mixture of both versions`)
      .toBe(chosen[seed.factory as keyof typeof chosen][id])
  }
  expect(await authoredFactories(owner, roomId), 'the two devices kept different plans')
    .toEqual(merged)

  // The copy is this device's plan as it stood before the answer, Casting included.
  const copyName = `${planName} (offline copy)`
  await expect.poll(async () => (await mirroredTabNamed(away, copyName)) !== undefined, {
    message: 'no offline copy was kept',
    timeout: 20_000,
  }).toBe(true)

  const copy = await mirroredTabNamed(away, copyName)
  for (const seed of SEEDS) {
    expect(productAmountIn(copy?.factories ?? [], seed.factory, seed.itemId)).toBe(seed.mine)
  }

  // A plain local plan: no room behind it and nothing for the sync engine to read.
  expect(await tabHolding(away, copyName)).toEqual({ kind: 'local', hasMeta: false })
})
