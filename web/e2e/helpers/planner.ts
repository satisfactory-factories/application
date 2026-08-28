import { expect } from '@playwright/test'
import type { BrowserContext, Locator, Page } from '@playwright/test'

/** What the tab bar is showing, as a user would read it. */
export interface TabBarEntry {
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
export const openPlanner = async (context: BrowserContext, path = '/'): Promise<Page> => {
  const page = await context.newPage()
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

export const readTabBar = (page: Page): Promise<TabBarEntry[]> =>
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

const storedTabs = (page: Page): Promise<StoredTab[]> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as StoredTab[])

const syncedTabIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const states = JSON.parse(localStorage.getItem('tabSyncStates') ?? '{}') as
      Record<string, { kind: string }>
    return Object.entries(states).filter(([, state]) => state.kind === 'synced').map(([id]) => id)
  })

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
export const mirroredFactories = async (page: Page, tabId: string): Promise<unknown[]> =>
  (await storedTabs(page)).find(tab => tab.id === tabId)?.factories ?? []

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
  await page.getByTestId('add-factory').click()

  const name = page.locator('input.factory-name').last()
  await expect(name).toBeVisible()
  await name.fill(edit.name)

  // The notes card is the one thing on a factory whose edit announces itself to
  // the sync engine without needing a recalculation first.
  await notesField(page).last().fill(edit.note)
}

export const factoryNames = (page: Page): Promise<string[]> =>
  page.locator('input.factory-name')
    .evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))
