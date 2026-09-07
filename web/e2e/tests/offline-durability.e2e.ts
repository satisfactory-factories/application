import { randomBytes } from 'node:crypto'

import type { Browser, BrowserContext, Page } from '@playwright/test'

import { API_URL, WEB_URL } from '../config'
import { expect, test } from '../helpers/fixtures'
import { newClient, registerUser } from '../helpers/accounts'
import type { TestUser } from '../helpers/accounts'
import {
  addFactory,
  createSyncedTab,
  expectQuiesced,
  factoryNames,
  mirroredFactories,
  mirrorRevision,
  openPlanner,
  outstandingIntent,
  selectTab,
} from '../helpers/planner'
import { showPlan } from '../helpers/rooms'
import { setOfflineMode } from '../helpers/session'

/**
 * The offline tests that came before this one sever the WebSocket with `installWsGate` and
 * keep the page, its store and everything in memory alive. That is a disconnection, not a
 * closed browser, and it is why a whole class of durability bug got through: the state that
 * mattered was in memory the entire time, so nothing ever proved it reached the disk.
 *
 * This one takes the network away for real, closes the browser context, and opens a new one
 * from nothing but what was written to browser storage.
 */

/** Same documentation range the account helper uses, so this device gets its own bucket. */
const ownAddress = (): string => `203.0.113.${(randomBytes(1)[0] % 254) + 1}`

/**
 * A browser reopened on the storage the closed one left behind. Deliberately built here
 * rather than through `newClient`: nothing is seeded, because the whole question is what
 * survived. `sessionStorage` is not part of a storage state either, which is exactly the
 * case a returning user is in.
 */
const reopenFrom = async (
  browser: Browser,
  storageState: Awaited<ReturnType<BrowserContext['storageState']>>,
): Promise<BrowserContext> => {
  const context = await browser.newContext({ storageState })
  const address = ownAddress()
  await context.route(`${API_URL}/**`, route => route.continue({
    headers: { ...route.request().headers(), 'x-forwarded-for': address },
  }))
  return context
}

interface JournalRoom {
  userTouchedIds?: number[]
  userTouchedFields?: string[]
  records?: Record<string, string>
}

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

/** One key as the closed browser left it, straight off the storage state. */
const storedValue = (storage: StorageState, key: string): string => {
  const origin = storage.origins.find(entry => entry.origin === WEB_URL)
  return origin?.localStorage.find(item => item.name === key)?.value ?? '{}'
}

const storedMeta = (storage: StorageState, tabId: string): JournalRoom | undefined =>
  (JSON.parse(storedValue(storage, 'tabMirrorMeta')) as Record<string, JournalRoom>)[tabId]

const storedRecordNames = (storage: StorageState, tabId: string): string[] => {
  const journal = JSON.parse(storedValue(storage, 'planSyncJournal')) as
    Record<string, { rooms?: Record<string, JournalRoom> }>

  return Object.values(journal)
    .flatMap(slot => Object.values(slot.rooms?.[tabId]?.records ?? {}))
    .map(print => (JSON.parse(print) as { name: string }).name)
}

/** Every instance slot's entry for one room, unioned the way the engine's boot does. */
const journalOf = (page: Page, tabId: string): Promise<JournalRoom> =>
  page.evaluate(id => {
    const journal = JSON.parse(localStorage.getItem('planSyncJournal') ?? '{}') as
      Record<string, { rooms?: Record<string, JournalRoom> } | undefined>

    const merged: Required<JournalRoom> = { userTouchedIds: [], userTouchedFields: [], records: {} }
    for (const slot of Object.values(journal)) {
      const room = slot?.rooms?.[id]
      if (!room) continue
      merged.userTouchedIds.push(...room.userTouchedIds ?? [])
      merged.userTouchedFields.push(...room.userTouchedFields ?? [])
      Object.assign(merged.records, room.records ?? {})
    }
    return merged
  }, tabId)

/** The names in the pending records, which is the unsent content rather than its intent. */
const pendingRecordNames = async (page: Page, tabId: string): Promise<string[]> =>
  Object.values((await journalOf(page, tabId)).records ?? {})
    .map(print => (JSON.parse(print) as { name: string }).name)
    .sort()

const pendingFields = async (page: Page, tabId: string): Promise<string[]> =>
  ((await journalOf(page, tabId)).userTouchedFields ?? []).sort()

/** The render mirror's copy of the tab-level field, which is saved on its own debounce. */
const mirroredPowerTarget = (page: Page, tabId: string): Promise<number | undefined> =>
  page.evaluate(id => {
    const tabs = JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as
      { id: string, powerTarget?: number }[]
    return tabs.find(tab => tab.id === id)?.powerTarget
  }, tabId)

/**
 * The power target strip is on screen whether the statistics are expanded or not, which
 * makes it the cheapest tab-level field a test can set. Nothing recalculates when it moves,
 * so it reaches the engine as declared intent or not at all.
 */
const setPowerTarget = async (page: Page, target: number): Promise<void> => {
  const field = page.locator('input#stats-power-target-collapsed')
  await expect(field).toBeVisible()
  await field.fill(String(target))
  await field.press('Tab')
  await expect(field).toHaveValue(String(target))
}

/**
 * Every client has sent everything it holds, they stand at the same revision, and they agree
 * on the authored content of every factory.
 *
 * Deliberately not `expectQuiesced`, which compares the whole stored record byte for byte.
 * A client booted from disk and a client that only ever took server diffs disagree about the
 * shape of an empty factory's `power` object, which neither of them authored and neither of
 * them sends; that predates this test and belongs to the calculation engine rather than to
 * sync. Everything a person typed is compared here.
 */
const expectSettled = async (pages: Page[], tabId: string): Promise<void> => {
  for (const page of pages) {
    await expect.poll(() => outstandingIntent(page, tabId), {
      timeout: 30_000,
      message: 'a client still had unsent edits',
    }).toBe(0)
  }

  const authored = async (page: Page) =>
    (await mirroredFactories(page, tabId))
      .map(({ id, name, notes, tasks, products }) => ({ id, name, notes, tasks, products }))

  await expect.poll(async () => {
    const revisions = await Promise.all(pages.map(page => mirrorRevision(page, tabId)))
    if (revisions[0] === null || revisions.some(revision => revision !== revisions[0])) return false

    const plans = await Promise.all(pages.map(authored))
    if (plans[0].length === 0) return false
    return plans.every(plan => JSON.stringify(plan) === JSON.stringify(plans[0]))
  }, { timeout: 30_000, message: 'the clients never settled on one plan' }).toBe(true)
}

const witnessOn = async (
  browser: Browser,
  user: TestUser,
  roomId: string,
): Promise<Page> => {
  const page = await openPlanner(await newClient(browser, { user }))
  await showPlan(page, user, roomId)
  await selectTab(page, roomId)
  return page
}

test('an edit made with the network gone survives closing the browser, and reaches the room when it opens again', async ({
  browser,
  request,
}) => {
  const user = await registerUser(request)

  const first = await newClient(browser, { user })
  const page = await openPlanner(first)
  const roomId = await createSyncedTab(page)
  await addFactory(page, { name: 'Baseline', note: 'made while online' })
  await expectQuiesced([page], roomId)

  const witness = await witnessOn(browser, user, roomId)
  await expect(witness.locator('input.factory-name')).toHaveValue('Baseline')

  // Airplane mode first, so the client is not mid-backoff when the wire goes; then the
  // wire, for real. `setOffline` is the browser's own network emulation: no socket, no
  // fetch, nothing that a route handler is quietly forwarding.
  await setOfflineMode(page, user, true)
  await first.setOffline(true)

  await addFactory(page, { name: 'Offline addition', note: 'made with the network gone' })
  await setPowerTarget(page, 1234)

  // Written to disk, not merely held: the browser is about to be closed on it.
  await expect.poll(() => pendingRecordNames(page, roomId), {
    message: 'the unsent record never reached browser storage',
    timeout: 20_000,
  }).toContain('Offline addition')
  await expect.poll(() => pendingFields(page, roomId), {
    message: 'the touched tab field never reached browser storage',
    timeout: 20_000,
  }).toContain('powerTarget')
  // The mirror is saved on a debounce of its own, so the intent can land before the value
  // it refers to. Both have to be down before the browser goes.
  await expect.poll(() => mirroredPowerTarget(page, roomId), {
    message: 'the tab field never reached the render mirror',
    timeout: 20_000,
  }).toBe(1234)

  const storage = await first.storageState()
  await first.close()

  // What the closed browser left on disk, read off the storage state itself rather than
  // through a live client: a reopened one reconnects and sends within a second, so asking
  // it would be racing the very flush this is about.
  const meta = storedMeta(storage, roomId)
  expect(
    (meta?.userTouchedIds?.length ?? 0) + (meta?.userTouchedFields?.length ?? 0),
    'the pending operations never reached browser storage',
  ).toBeGreaterThan(0)
  expect(meta?.userTouchedFields, 'the touched tab field never reached browser storage')
    .toContain('powerTarget')
  expect(storedRecordNames(storage, roomId)).toContain('Offline addition')

  // Nothing survives in memory from here: a different browser context, booted on what the
  // closed one left behind, and without the per-tab session id either.
  const reopened = await reopenFrom(browser, storage)
  const back = await openPlanner(reopened)

  await selectTab(back, roomId)
  await expect.poll(() => factoryNames(back)).toEqual(['Baseline', 'Offline addition'])
  await expect.poll(() => mirroredPowerTarget(back, roomId), {
    message: 'the tab field the reopened browser restored was overwritten by the room',
    timeout: 30_000,
  }).toBe(1234)

  // Offline mode is a stance rather than stored state, so the reopened browser connects on
  // its own and the edit made while it was isolated goes out.
  await expect.poll(() => factoryNames(witness), {
    message: 'the offline edit never reached the room after the browser was reopened',
    timeout: 40_000,
  }).toEqual(['Baseline', 'Offline addition'])

  await expectSettled([back, witness], roomId)
  await reopened.close()
})

/**
 * The same close-and-reopen, with a second browser tab of the same browser writing over the
 * shared keys in between. `localStorage.factoryTabs` and `tabMirrorMeta` are both single
 * keys replaced wholesale, so the sibling's generation is one that never carried this
 * device's offline edit.
 */
test('a second browser tab writing the plan cannot take away the offline edit', async ({
  browser,
  request,
}) => {
  const user = await registerUser(request)

  const first = await newClient(browser, { user })
  const page = await openPlanner(first)
  const roomId = await createSyncedTab(page)
  await addFactory(page, { name: 'Baseline', note: 'made while online' })
  await expectQuiesced([page], roomId)

  await setOfflineMode(page, user, true)
  await first.setOffline(true)
  await addFactory(page, { name: 'Offline addition', note: 'made with the network gone' })

  await expect.poll(() => pendingRecordNames(page, roomId), { timeout: 20_000 })
    .toContain('Offline addition')

  const storage = await first.storageState()
  await first.close()

  const reopened = await reopenFrom(browser, storage)
  const back = await openPlanner(reopened)

  // Exactly what a sibling browser tab's own save does: its whole plan over the shared
  // key, and its own sync metadata over the sidecar. Neither knows about the edit above.
  await back.evaluate(id => {
    const stored = JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as
      { id: string, factories: { name: string }[] }[]
    const plan = stored.map(tab => tab.id !== id
      ? tab
      : { ...tab, factories: tab.factories.filter(factory => factory.name !== 'Offline addition') })
    localStorage.setItem('factoryTabs', JSON.stringify(plan))

    const meta = JSON.parse(localStorage.getItem('tabMirrorMeta') ?? '{}') as Record<string, unknown>
    meta[id] = { revision: 1, appVersion: 'sibling', userTouchedIds: [], userTouchedFields: [], declaredRemovals: [] }
    localStorage.setItem('tabMirrorMeta', JSON.stringify(meta))
  }, roomId)

  const survivor = await openPlanner(await reopenFrom(browser, await reopened.storageState()))
  await selectTab(survivor, roomId)

  await expect.poll(() => factoryNames(survivor), {
    message: 'the sibling browser tab\'s save took the offline edit with it',
    timeout: 30_000,
  }).toEqual(['Baseline', 'Offline addition'])

  await reopened.close()
})
