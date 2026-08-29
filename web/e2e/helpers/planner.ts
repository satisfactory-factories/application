import { isDeepStrictEqual } from 'node:util'

import { expect } from '@playwright/test'
import type { BrowserContext, Locator, Page } from '@playwright/test'

/** What the tab bar is showing, as a user would read it. */
export interface TabBarEntry {
  /** Zipped in from `localStorage.factoryTabs`; the DOM carries no id of its own. */
  id: string
  name: string
  kind: 'local' | 'synced' | 'collaborative'
  selected: boolean
}

interface StoredTab {
  id: string
  name: string
  factories: unknown[]
}

/** Open a page in a client and wait until the planner is done loading. */
export const openPlanner = async (
  context: BrowserContext,
  path = '/',
  /** Runs before the first navigation, for routing that must be in place by then. */
  prepare?: (page: Page) => Promise<void>,
): Promise<Page> => {
  const page = await context.newPage()
  if (prepare) await prepare(page)
  await page.goto(path)
  await settle(page)
  return page
}

/**
 * Nothing here polls a fixed duration: the loader overlay is the app's own
 * statement that a plan is mid-load, and the tab bar only renders once routing
 * has settled.
 */
export const settle = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('add-tab')).toBeVisible()
  await expect(page.locator('[data-testid="loading-overlay"]:visible')).toHaveCount(0)
}

// ===== Tabs =====

const readTabElements = (page: Page): Promise<Omit<TabBarEntry, 'id'>[]> =>
  page.locator('[data-testid="factory-tab"]').evaluateAll(elements => elements.map(element => {
    // FontAwesome swaps each <i> for an <svg>, but keeps the icon class on it.
    const state = element.querySelector('.tab-state')
    const kind = state?.querySelector('.fa-desktop')
      ? 'local'
      : state?.querySelector('.fa-users') ? 'collaborative' : 'synced'

    const clone = element.cloneNode(true) as HTMLElement
    for (const extra of clone.querySelectorAll('.tab-state, button')) extra.remove()
    const editor = element.querySelector('input')

    return {
      name: editor ? editor.value : (clone.textContent ?? '').trim(),
      kind: kind as TabBarEntry['kind'],
      selected: element.classList.contains('v-tab--selected'),
    }
  }))

/**
 * The mirror is persisted on a 500ms debounce, so the zipped ids can lag the DOM
 * by that much. Every assertion built on them polls rather than reading once.
 */
export const readTabBar = async (page: Page): Promise<TabBarEntry[]> => {
  const [ids, entries] = await Promise.all([
    storedTabs(page).then(tabs => tabs.map(tab => tab.id)),
    readTabElements(page),
  ])
  return entries.map((entry, index) => ({ ...entry, id: ids[index] ?? '' }))
}

export const tabNames = async (page: Page): Promise<string[]> =>
  (await readTabElements(page)).map(entry => entry.name)

const storedTabs = (page: Page): Promise<StoredTab[]> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as StoredTab[])

const syncedTabIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const states = JSON.parse(localStorage.getItem('tabSyncStates') ?? '{}') as
      Record<string, { kind: string }>
    return Object.entries(states).filter(([, state]) => state.kind === 'synced').map(([id]) => id)
  })

/**
 * What the tab *is*, read from the app's own record rather than from the icon:
 * a revoked tab has to be provably local, not merely drawn that way.
 */
export const tabKind = (page: Page, tabId: string): Promise<TabBarEntry['kind'] | null> =>
  page.evaluate(id => {
    const tabs = JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as { id: string }[]
    if (!tabs.some(tab => tab.id === id)) return null

    // Revocation deletes the entry rather than rewriting it: absent *is* local.
    const states = JSON.parse(localStorage.getItem('tabSyncStates') ?? '{}') as
      Record<string, { kind: string, shared: boolean } | undefined>
    const state = states[id]
    if (!state || state.kind === 'local') return 'local' as const
    return state.kind === 'joined' || state.shared ? 'collaborative' as const : 'synced' as const
  }, tabId)

export const expectTabKind = async (
  page: Page,
  tabId: string,
  kind: TabBarEntry['kind'] | null,
): Promise<void> => {
  await expect.poll(() => tabKind(page, tabId), {
    message: `tab ${tabId} never became ${kind}`,
  }).toBe(kind)
}

/**
 * The plus button's chooser, taking the synced half. Returns the new room id,
 * which is the tab's own UUID — identity never changes when a tab is synced.
 */
export const createSyncedTab = async (page: Page): Promise<string> => {
  const before = new Set(await syncedTabIds(page))

  await page.getByTestId('add-tab').click()
  await page.getByTestId('choose-synced-tab').click()
  await expect(page.getByTestId('choose-synced-tab')).toBeHidden()

  let created: string | undefined
  await expect.poll(async () => {
    created = (await syncedTabIds(page)).find(id => !before.has(id))
    return created !== undefined
  }, { message: 'the new synced tab never reached tabSyncStates' }).toBe(true)

  await settle(page)
  return created as string
}

/** Brings a tab to the front by room id; names are not unique, ids are. */
export const selectTab = async (page: Page, tabId: string): Promise<void> => {
  let index = -1
  await expect.poll(async () => {
    index = (await storedTabs(page)).findIndex(tab => tab.id === tabId)
    return index
  }, { message: `tab ${tabId} never appeared in this client's tab bar` }).toBeGreaterThanOrEqual(0)

  await page.locator('[data-testid="factory-tab"]').nth(index).click()
  await settle(page)
}

export const waitForTab = async (page: Page, tabId: string): Promise<void> => {
  await expect.poll(async () => (await storedTabs(page)).some(tab => tab.id === tabId), {
    message: `tab ${tabId} never reached this client`,
  }).toBe(true)
}

/** The pencil on the selected tab. Absent entirely for anyone who may not rename. */
export const renameAffordance = (page: Page): Locator =>
  page.locator('[data-testid="factory-tab"].v-tab--selected button')

export const renameCurrentTab = async (page: Page, name: string): Promise<void> => {
  await renameAffordance(page).click()
  const field = page.locator('[data-testid="factory-tab"].v-tab--selected input')
  await expect(field).toBeVisible()
  await field.fill(name)
  await renameAffordance(page).click()
  await expect(field).toBeHidden()
}

const tabBarButton = (page: Page, icon: string): Locator =>
  page.locator(`.tab-bar button:has(.${icon})`)

/** Deletes the current tab, accepting the confirmation the app insists on. */
export const deleteCurrentTab = async (page: Page): Promise<void> => {
  page.once('dialog', dialog => void dialog.accept())
  await tabBarButton(page, 'fa-trash').click()
}

/**
 * Sortable only reacts to a real pointer gesture, so the move is stepped rather
 * than a single jump; `dragTo` lands in one move and the library ignores it.
 */
export const dragTab = async (page: Page, fromIndex: number, toIndex: number): Promise<void> => {
  const tabs = page.locator('[data-testid="factory-tab"]')
  const from = await tabs.nth(fromIndex).boundingBox()
  const to = await tabs.nth(toIndex).boundingBox()
  if (!from || !to) throw new Error(`tabs ${fromIndex} and ${toIndex} are not both on screen`)

  const y = from.y + from.height / 2
  await page.mouse.move(from.x + from.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 - 10, y, { steps: 4 })
  await page.mouse.move(to.x + 4, to.y + to.height / 2, { steps: 12 })
  await page.mouse.move(to.x + 2, to.y + to.height / 2)
  await page.mouse.up()
}

// ===== Sync state =====

/** The revision the mirror was last acknowledged at, or null when never synced. */
export const mirrorRevision = (page: Page, tabId: string): Promise<number | null> =>
  page.evaluate(id => {
    const meta = JSON.parse(localStorage.getItem('tabMirrorMeta') ?? '{}') as
      Record<string, { revision: number } | undefined>
    return meta[id]?.revision ?? null
  }, tabId)

export const waitForRevision = async (
  page: Page,
  tabId: string,
  revision: number,
  timeout = 15_000,
): Promise<void> => {
  await expect.poll(() => mirrorRevision(page, tabId), {
    timeout,
    message: `${tabId} never reached revision ${revision}`,
  }).toBeGreaterThanOrEqual(revision)
}

/** The render mirror for one tab, which is what a deep-equal check compares. */
export const mirroredFactories = async (page: Page, tabId: string): Promise<MirroredFactory[]> =>
  ((await storedTabs(page)).find(tab => tab.id === tabId)?.factories ?? []) as MirroredFactory[]

export interface MirroredFactory {
  id: number
  name: string
  notes: string
  tasks: { title: string, completed: boolean }[]
}

export const mirroredNote = async (
  page: Page,
  tabId: string,
  factoryName: string,
): Promise<string | undefined> =>
  (await mirroredFactories(page, tabId)).find(factory => factory.name === factoryName)?.notes

/** The mirror lags the field by the persistence debounce, so this is always polled. */
export const expectMirroredNote = async (
  page: Page,
  tabId: string,
  factoryName: string,
  note: string,
): Promise<void> => {
  await expect.poll(() => mirroredNote(page, tabId, factoryName), {
    message: `${factoryName}'s note never reached this client's mirror`,
  }).toBe(note)
}

/**
 * Edits this client has made and the server has not yet acknowledged. The engine
 * persists them for exactly this reason, which makes "nothing left to send" a
 * fact to read rather than a duration to guess at.
 */
export const outstandingIntent = (page: Page, tabId: string): Promise<number> =>
  page.evaluate(id => {
    const meta = JSON.parse(localStorage.getItem('tabMirrorMeta') ?? '{}') as
      Record<string, { userTouchedIds?: unknown[], userTouchedFields?: unknown[] } | undefined>
    const entry = meta[id]
    if (!entry) return 0
    return (entry.userTouchedIds?.length ?? 0) + (entry.userTouchedFields?.length ?? 0)
  }, tabId)

/** Every client has sent everything it holds, and they all agree on the result. */
export const expectQuiesced = async (pages: Page[], tabId: string): Promise<void> => {
  for (const page of pages) {
    await expect.poll(() => outstandingIntent(page, tabId), {
      timeout: 30_000,
      message: 'a client still had unsent edits',
    }).toBe(0)
  }
  await expectConverged(pages, tabId)
}

/**
 * Quiesced means every client acknowledged the same revision and holds the same
 * bytes — never "we waited long enough". The plan has to be non-empty: the mirror
 * is written on a debounce, and two clients that have not persisted anything yet
 * are trivially "equal".
 */
export const expectConverged = async (pages: Page[], tabId: string): Promise<void> => {
  await expect.poll(async () => {
    const revisions = await Promise.all(pages.map(page => mirrorRevision(page, tabId)))
    if (revisions[0] === null || revisions.some(revision => revision !== revisions[0])) return false

    const mirrors = await Promise.all(pages.map(page => mirroredFactories(page, tabId)))
    if (mirrors[0].length === 0) return false
    return mirrors.every(mirror => isDeepStrictEqual(mirror, mirrors[0]))
  }, { timeout: 30_000, message: 'the clients never converged on one state' }).toBe(true)
}

// ===== Editing =====

export interface FactoryEdit {
  name: string
  note: string
}

/**
 * The notes card's editable field. `auto-grow` makes Vuetify render a second,
 * aria-hidden textarea to measure against, and it is the one that comes last.
 */
export const notesField = (page: Page): Locator =>
  page.locator('[id$="-notes"] textarea:not([aria-hidden="true"])')

/**
 * One user-made edit: a factory, named, with a note. `fill` rather than typing
 * because a rebase can replace the factory object mid-burst, and a single input
 * event cannot be split across that.
 */
export const addFactory = async (page: Page, edit: FactoryEdit): Promise<void> => {
  // Keyboard rather than mouse: the button is the last thing in the column, and
  // the offline banner is fixed to the bottom of the viewport on top of it.
  await page.getByTestId('add-factory').press('Enter')

  const name = page.locator('input.factory-name').last()
  await expect(name).toBeVisible()
  await name.fill(edit.name)

  // A note needs no recalculation to reach the sync engine, so it is the cheapest
  // per-factory payload a test can give a new card.
  await notesField(page).last().fill(edit.note)
}

/** Edits a factory already on screen, addressed by its position in the plan. */
export const setFactoryNote = async (
  page: Page,
  index: number,
  note: string,
): Promise<void> => {
  const field = notesField(page).nth(index)
  await expect(field).toBeVisible()
  await field.fill(note)
}

/**
 * The sidebar's "Clear", through the confirmation it insists on. Scoped to the docked
 * sidebar: the mobile drawer renders the same component, so the id matches twice.
 */
export const clearPlan = async (page: Page): Promise<void> => {
  page.once('dialog', dialog => void dialog.accept())
  await page.locator('.sidebar-content').getByTestId('clear-plan').click()
  await expect(page.locator('input.factory-name')).toHaveCount(0)
}

export const factoryNames = (page: Page): Promise<string[]> =>
  page.locator('input.factory-name')
    .evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))

/** Renames a factory in place, addressed by its position in the plan. */
export const renameFactory = async (
  page: Page,
  index: number,
  name: string,
): Promise<void> => {
  const field = page.locator('input.factory-name').nth(index)
  await expect(field).toBeVisible()
  await field.fill(name)
}

/** The tasks card's "New Task" field; Enter is what commits it. */
export const addTask = async (page: Page, index: number, title: string): Promise<void> => {
  const field = page.locator('[id$="-tasks"]').nth(index).locator('input[type="text"]')
  await expect(field).toBeVisible()
  await field.fill(title)
  await field.press('Enter')
  await expect(field).toHaveValue('')
}

export const mirroredTasks = async (
  page: Page,
  tabId: string,
  factoryName: string,
): Promise<string[]> =>
  ((await mirroredFactories(page, tabId)).find(factory => factory.name === factoryName)?.tasks ?? [])
    .map(task => task.title)
