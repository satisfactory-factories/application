import type { Page } from '@playwright/test'

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
import { closeAccountPanel, signIn } from '../helpers/session'

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

const adoptOn = async (page: Page, user: TestUser): Promise<void> => {
  await signIn(page, user)
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
  // than merging anything.
  await adoptOn(second, user)
  await expectTabKind(second, secondTab, 'synced')

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

  await signIn(page, user)

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
