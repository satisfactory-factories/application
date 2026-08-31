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
 *
 * `--active` is that statement; presence is not. Vuetify keeps a dismissed
 * overlay's root mounted until its leave transition reports back, and that root
 * is a full-viewport box, so `:visible` reads a finished load as a running one
 * whenever the callback is late.
 */
export const loadingOverlay = (page: Page): Locator =>
  page.locator('[data-testid="loading-overlay"].v-overlay--active')

export const settle = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('add-tab')).toBeVisible()
  const overlay = loadingOverlay(page)
  await expect(overlay).toHaveCount(0)
  // A snapshot landing a moment after the first check raises a load of its own,
  // and one clear sample would have read that as a settled planner. Two clear
  // samples with a gap is the cheap guard; every await of a snapshot needs it.
  await page.waitForTimeout(250)
  await expect(overlay).toHaveCount(0)
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

/** The plus button's chooser, taking the local half. */
export const addLocalTab = async (page: Page): Promise<void> => {
  await page.getByTestId('add-tab').click()
  await page.getByTestId('choose-local-tab').click()
  await expect(page.getByTestId('choose-local-tab')).toBeHidden()
  await settle(page)
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

/**
 * Clicks a tab in the bar by room id, and returns the moment the click lands. For a test
 * watching what the switch puts on screen; everything else wants `selectTab`.
 */
export const clickTab = async (page: Page, tabId: string): Promise<void> => {
  let index = -1
  await expect.poll(async () => {
    index = (await storedTabs(page)).findIndex(tab => tab.id === tabId)
    return index
  }, { message: `tab ${tabId} never appeared in this client's tab bar` }).toBeGreaterThanOrEqual(0)

  await page.locator('[data-testid="factory-tab"]').nth(index).click()
}

/** Brings a tab to the front by room id; names are not unique, ids are. */
export const selectTab = async (page: Page, tabId: string): Promise<void> => {
  await clickTab(page, tabId)
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
  products: { id: string, amount: number }[]
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
  // 30s: convergence rides two debounce cycles plus rebase churn, and a loaded
  // 2-core CI runner can stretch that past the default 10s poll.
  await expect.poll(() => mirroredNote(page, tabId, factoryName), {
    message: `${factoryName}'s note never reached this client's mirror`,
    timeout: 30_000,
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
  const freshId = await addNamedFactory(page, edit.name)
  const card = page.locator(`[id="${freshId}"]`)

  // A note needs no recalculation to reach the sync engine, so it is the cheapest
  // per-factory payload a test can give a new card.
  await card.locator(`[id="${freshId}-notes"] textarea:not([aria-hidden="true"])`).fill(edit.note)
}

/** The name half alone, for a test that only needs the plan to be a certain size. */
export const addNamedFactory = async (page: Page, factoryName: string): Promise<string> => {
  // Keyboard rather than mouse: the button is the last thing in the column, and
  // the offline banner is fixed to the bottom of the viewport on top of it.
  await page.getByTestId('add-factory').press('Enter')

  // The new card is the one the cursor landed in. Focus is client-local, so a
  // concurrent client's identical default-named record can never be confused
  // with ours no matter how the timing falls — matching by name or position
  // both lost that race on CI.
  const focused = page.locator('input.factory-name:focus')
  await expect(focused, 'the new factory never focused its name field').toBeVisible()
  const freshId = await focused.evaluate(el => el.closest('.factory-card:not(.sub-card)')?.id ?? '')
  expect(freshId, 'the focused name field sits outside a factory card').not.toBe('')

  const card = page.locator(`[id="${freshId}"]`)
  const name = card.locator('input.factory-name')
  await name.fill(factoryName)
  await commitName(name)
  // A rebase racing the commit can still revert the draft; a person retypes,
  // and so does the test — once.
  try {
    await expect(name).toHaveValue(factoryName, { timeout: 2_000 })
  } catch {
    await name.fill(factoryName)
    await commitName(name)
    await expect(name).toHaveValue(factoryName)
  }

  return freshId
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

/**
 * The card headers. These hold a *draft* the card only writes back on blur or Enter, so a
 * field still being edited reads as renamed when the plan is not. Every helper that types
 * into one commits it, which is what keeps this read honest.
 */
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
  await commitName(field)
}

/**
 * Enter is what writes a header draft back to the factory and declares the rename; a filled
 * field alone changes nothing. The blur it leaves behind is the proof the handler ran, so
 * this waits on that rather than on a duration.
 */
const commitName = async (field: Locator): Promise<void> => {
  await field.press('Enter')
  await expect(field).not.toBeFocused()
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

// ===== Products =====

/** The main-column card for a factory, addressed by its name field's position. */
export const factoryCard = async (page: Page, index: number): Promise<Locator> => {
  const name = page.locator('input.factory-name').nth(index)
  await expect(name).toBeVisible()
  const id = await name.evaluate(el => el.closest('.factory-card:not(.sub-card)')?.id ?? '')
  expect(id, 'the factory name field sits outside a factory card').not.toBe('')
  return page.locator(`[id="${id}"]`)
}

export const productRows = (card: Locator): Locator =>
  card.locator('[data-testid="product-row"]')

/**
 * The item each product row is showing. Vuetify renders a picker's selection as
 * its own element and leaves the `<input>` holding the *search* text, which is
 * blank on every field nobody is typing into — so the input is not the answer.
 */
export const selectedProductItems = (card: Locator): Locator =>
  card.locator('[data-testid="product-row"] .v-input:has(input[id$="-item"]) .v-autocomplete__selection-text')

export const productNames = async (card: Locator): Promise<string[]> =>
  (await selectedProductItems(card).allTextContents()).map(text => text.trim())

/**
 * "Add Product", then the item chosen from the picker. The blank row is stored
 * content on its own and the selection is what turns it into a real product, so
 * both halves have to reach the other client.
 */
export const addProduct = async (page: Page, index: number, item: string): Promise<void> => {
  const card = await factoryCard(page, index)
  const before = await productRows(card).count()
  await card.getByRole('button', { name: 'Add Product' }).click()

  // A product with no id yet: the row's picker is `<factoryId>--item` until one
  // is chosen, which is the only client-local way to name the row just added.
  const picker = card.locator('input[id$="--item"]')
  await expect(picker, 'the new product row never appeared').toBeVisible()
  await picker.fill(item)
  await page.getByRole('option', { name: item, exact: true }).first().click()

  await expect(productRows(card)).toHaveCount(before + 1)
  await expect.poll(() => productNames(card), {
    message: `the product picker never settled on ${item}`,
  }).toContain(item)
}

/** Polled and visibility-honest: the row is on screen and it names the item. */
export const expectProductVisible = async (
  page: Page,
  index: number,
  item: string,
): Promise<void> => {
  const card = await factoryCard(page, index)
  await expect.poll(() => productNames(card), {
    message: `${item} never reached this client's product list`,
    timeout: 30_000,
  }).toContain(item)

  await expect(
    selectedProductItems(card).filter({ hasText: item }).first(),
    'the product is in the DOM but not on screen',
  ).toBeVisible()
}

/** The item ids the mirror holds for one factory, which is what actually synced. */
export const mirroredProducts = async (
  page: Page,
  tabId: string,
  factoryName: string,
): Promise<string[]> =>
  ((await mirroredFactories(page, tabId)).find(factory => factory.name === factoryName)?.products ?? [])
    .map(product => product.id)

/**
 * Wires one factory to import an item from another. This is the link that makes a
 * missing factory *visible*: the engine resolves every input by id, so a plan whose
 * producer has vanished trips "Factory not found" and the corruption alert.
 */
export const addImport = async (
  page: Page,
  index: number,
  sourceName: string,
  item: string,
  amount = 60,
): Promise<void> => {
  const card = await factoryCard(page, index)
  const imports = card.locator('[id$="-imports"]')
  await imports.getByRole('button', { name: 'Add Import' }).click()

  const row = imports.locator('.selectors').last()
  await expect(row, 'the new import row never appeared').toBeVisible()

  /**
   * `dispatchEvent` rather than `click`: this menu renders where a real pointer event
   * does not reach the option, and a forced click still lands on whatever is on top.
   * The product picker's own menu opens higher up the card and has no such problem.
   */
  const pick = async (label: string, value: string) => {
    const field = row.getByLabel(label, { exact: true })
    await field.click()
    await field.fill(value)
    const option = page.getByRole('option', { name: value, exact: true }).first()
    await expect(option, `the ${label} picker never offered ${value}`).toBeVisible()
    await option.dispatchEvent('click')
  }

  await pick('Factory', sourceName)
  await pick('Item', item)

  const qty = row.getByLabel('Qty /min', { exact: true })
  await qty.fill(String(amount))
  await qty.blur()

  await expect.poll(() => importedItems(page, index), {
    message: `the import of ${item} from ${sourceName} never settled`,
  }).toContain(item)
}

/** The items the factory at `index` is importing, read off its own inputs. */
export const importedItems = async (page: Page, index: number): Promise<string[]> => {
  const card = await factoryCard(page, index)
  return (await card.locator('[id$="-imports"] .selectors .v-autocomplete__selection-text')
    .allTextContents()).map(text => text.trim())
}

/**
 * Moves a factory one place down the plan, through the Arrange dialog. Buttons
 * rather than the sidebar's drag gesture: the reorder under test is the write
 * and its fan-out, and Sortable's pointer choreography is a second thing to fail.
 */
export const moveFactoryDown = async (page: Page, index: number): Promise<void> => {
  await page.locator('.sidebar-content .arrange-btn').click()
  const dialog = page.getByTestId('arrange-dialog')
  await expect(dialog).toBeVisible()

  await dialog.locator('.factory-row').nth(index).locator('.factory-down').click()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toBeHidden()
}

// ===== Sidebar =====

/**
 * The docked sidebar's factory rows. Scoped to `.sidebar-content`: the navigation
 * drawer renders the same component, so an unscoped id matches every row twice.
 */
export const sidebarFactoryRows = (page: Page): Locator =>
  page.locator('.sidebar-content [data-testid="sidebar-factory-row"]')

/**
 * The sidebar visibly lists exactly these factories, in order. `toBeVisible`
 * rather than a count or a text read: the bug this guards against renders the
 * rows into a sidebar nobody can see.
 */
export const expectSidebarLists = async (page: Page, names: string[]): Promise<void> => {
  const rows = sidebarFactoryRows(page)
  await expect(rows, 'the sidebar never listed the right number of factories')
    .toHaveCount(names.length)

  for (const [index, name] of names.entries()) {
    await expect(rows.nth(index), `sidebar row ${index} is not on screen`).toBeVisible()
    await expect(rows.nth(index)).toContainText(name)
  }
}
