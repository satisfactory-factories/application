import type { Page } from '@playwright/test'

import { WEB_URL } from '../config'
import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import type { TestUser } from '../helpers/accounts'
import {
  addFactory,
  addLocalTab,
  expectTabKind,
  mirroredFactories,
  openPlanner,
  readTabBar,
  tabNames,
} from '../helpers/planner'
import { showPlan } from '../helpers/rooms'
import { closeAccountPanel, signIn } from '../helpers/session'
import type { ChooserAnswer } from '../helpers/session'

const adoptionDialog = async (page: Page) => {
  const dialog = page.getByTestId('adoption-dialog')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await expect(dialog).toContainText('Sync your planner tabs now?')
  return dialog
}

/** The offer is opt-out, so accepting it is one button on a dialog nothing dismisses. */
const acceptAdoption = async (page: Page): Promise<void> => {
  const dialog = await adoptionDialog(page)
  await dialog.getByRole('button', { name: /^Sync \d+ plan/ }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

/** Polled: the id comes from the mirror, which is written on a debounce. */
const localTabId = async (page: Page): Promise<string> => {
  let id = ''
  await expect.poll(async () => {
    id = (await readTabBar(page))[0]?.id ?? ''
    return id
  }, { message: 'the local tab never reached the mirror' }).not.toBe('')
  return id
}

/** Sign in and accept the adoption offer; the chooser fronts it once rooms exist. */
const adoptOn = async (page: Page, user: TestUser, chooser: ChooserAnswer = 'none'): Promise<void> => {
  await signIn(page, user, { chooser })
  await acceptAdoption(page)
  await closeAccountPanel(page)
}

test('two browsers with different local plans both adopt into one account', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)

  // Two devices, each with a plan of its own and no account behind it. Neither plan
  // is ever calculated, which is the shape adoption used to refuse outright.
  const first = await openPlanner(await client())
  await addFactory(first, { name: 'Alpha plan', note: 'made on the first device' })
  const firstTab = await localTabId(first)

  const second = await openPlanner(await client())
  await addFactory(second, { name: 'Beta plan', note: 'made on the second device' })
  const secondTab = await localTabId(second)

  await adoptOn(first, user)
  await expectTabKind(first, firstTab, 'synced')

  // The second device's plan collides on name, so adoption suffixes it rather
  // than merging anything. The account holds a room by now, so its sign-in is
  // fronted by the chooser, which opens the first device's plan here.
  await adoptOn(second, user, 'open-all')
  await expectTabKind(second, secondTab, 'synced')

  // Each device ends up holding the plan the other adopted: the first opts in
  // through the panel, the second already opened it through the chooser.
  await showPlan(first, user, secondTab)
  await showPlan(second, user, firstTab)

  for (const page of [first, second]) {
    await expect.poll(async () => [...await tabNames(page)].sort(), {
      timeout: 30_000,
      message: 'a device never saw both plans',
    }).toEqual(['Default', 'Default (local)'])

    // Nothing stranded: every tab in the bar belongs to the account now.
    await expect.poll(async () => (await readTabBar(page)).map(entry => entry.kind), {
      message: 'a local tab was left behind',
    }).toEqual(['synced', 'synced'])

    await expect.poll(async () =>
      (await mirroredFactories(page, firstTab)).map(factory => factory.name),
    { timeout: 30_000, message: 'the first device\'s plan did not reach both bars' },
    ).toEqual(['Alpha plan'])
    await expect.poll(async () =>
      (await mirroredFactories(page, secondTab)).map(factory => factory.name),
    { timeout: 30_000, message: 'the second device\'s plan did not reach both bars' },
    ).toEqual(['Beta plan'])
  }
})

test('unticking a plan leaves that one local and syncs the rest', async ({ client, request }) => {
  const user = await registerUser(request)
  const page = await openPlanner(await client())

  await addFactory(page, { name: 'Kept local', note: 'the one that gets unticked' })
  await addLocalTab(page)
  await addFactory(page, { name: 'Synced up', note: 'the one that stays ticked' })

  let ids: string[] = []
  await expect.poll(async () => {
    ids = (await readTabBar(page)).map(entry => entry.id)
    return ids.length === 2 && ids.every(Boolean)
  }, { message: 'both local plans never reached the mirror' }).toBe(true)
  const [first, second] = ids

  // A fresh account holds no rooms, so no chooser fronts this sign-in.
  await signIn(page, user, { chooser: 'none' })

  const dialog = await adoptionDialog(page)
  const rows = dialog.getByTestId('adoption-candidate')
  await expect(rows).toHaveCount(2)

  const firstBox = rows.first().locator('input')
  await firstBox.click()
  // The tick has to follow the click, which is the half that was reported broken.
  await expect(firstBox).not.toBeChecked()
  await expect(rows.nth(1).locator('input')).toBeChecked()
  await expect(dialog.getByTestId('adopt-submit')).toContainText('Sync 1 plan')

  await dialog.getByTestId('adopt-submit').click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })

  await expectTabKind(page, first, 'local')
  await expectTabKind(page, second, 'synced')
})

/**
 * The other way a plan reaches the cloud, and the one a user reported missing:
 * signed in first, plan pasted in afterwards. The sign-in sweep has already run
 * by then (on an empty bar it finds nothing and records no answer), so the
 * paste raises the offer for the plan that just landed, or nothing ever does.
 */
test('a plan pasted in while signed in is offered to the cloud where it lands', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)
  const device = await client({ user })
  // The planner's own copy/paste, so the clipboard is really the clipboard.
  await device.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB_URL })

  const page = await openPlanner(device)
  const actions = page.locator('.sidebar-content')

  // A plan worth copying, in the tab the browser opened with. The sign-in sweep
  // already ran against an empty bar, so nothing has been asked or answered.
  await addFactory(page, { name: 'Copied from the live site', note: 'about to be pasted' })
  await expect(page.getByTestId('adoption-dialog')).toBeHidden()
  await actions.getByTestId('export-plan').click()
  await page.getByTestId('export-to-clipboard').click()

  // Somewhere for it to land: a second, empty, local tab, which is the one on
  // screen: the plan replaces the tab you are looking at, not the first in the bar.
  await addLocalTab(page)
  let landing = ''
  await expect.poll(async () => {
    landing = (await readTabBar(page)).find(entry => entry.selected)?.id ?? ''
    return landing
  }, { message: 'the new local tab never reached the mirror' }).not.toBe('')
  await expectTabKind(page, landing, 'local')

  await actions.getByTestId('import-plan').click()
  await page.getByTestId('import-from-clipboard').click()

  // The offer, for that one plan, in the singular.
  const dialog = page.getByTestId('adoption-dialog')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(dialog).toContainText('Send this plan to your account?')
  await expect(dialog).toContainText('This plan lives only in this browser')

  await dialog.getByRole('button', { name: /^Sync \d+ plan/ }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })

  // Accepted: the tab it landed in is on the account now, whole.
  await expectTabKind(page, landing, 'synced')
  await expect.poll(
    async () => (await mirroredFactories(page, landing)).map(entry => entry.name),
    { message: 'the pasted plan never reached the account' },
  ).toEqual(['Copied from the live site'])
})
