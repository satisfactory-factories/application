import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import type { TestUser } from './accounts'

/**
 * The account button exists twice — once in the app bar, once in the navigation
 * drawer's append slot — and both are visible on a desktop viewport. The app bar
 * is the one a desktop user actually reaches for.
 */
const accountButton = (page: Page, name: string | RegExp): Locator =>
  page.getByRole('banner').getByRole('button', { name })

/**
 * How to answer the plan chooser an interactive sign-in raises whenever the
 * account holds plans this browser has not opened. `open-all` and `not-now`
 * both wait for the dialog; `none` is for signing into an account whose every
 * room is already open here (or that has none), where it never appears.
 */
export type ChooserAnswer = 'open-all' | 'not-now' | 'none'

export const answerPlanChooser = async (
  page: Page,
  answer: Exclude<ChooserAnswer, 'none'>,
): Promise<void> => {
  const dialog = page.getByTestId('plan-chooser-dialog')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await dialog.getByTestId(answer === 'open-all' ? 'chooser-submit' : 'chooser-decline').click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

/** Signs in through the real tray, which is what emits `loggedIn`. */
export const signIn = async (
  page: Page,
  user: TestUser,
  { chooser = 'open-all' }: { chooser?: ChooserAnswer } = {},
): Promise<void> => {
  await accountButton(page, 'Sign In, Pioneer!').click()
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()

  await expect(accountButton(page, user.username)).toBeVisible()
  if (chooser !== 'none') await answerPlanChooser(page, chooser)
}

/** The tray is already open straight after signing in, so this is idempotent. */
export const openAccountPanel = async (page: Page, user: TestUser): Promise<void> => {
  if (await page.getByTestId('account-panel').isVisible()) return
  await accountButton(page, user.username).click()
  await expect(page.getByTestId('account-panel')).toBeVisible()
}

/**
 * The tray has no scrim, so it is left covering the planner until it is shut.
 * Escape rather than the activator: the overlay swallows a second click on it
 * while something else on the page has just taken focus.
 */
export const closeAccountPanel = async (page: Page): Promise<void> => {
  if (!await page.getByTestId('account-panel').isVisible()) return
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('account-panel')).toBeHidden()
}

/**
 * The airplane switch. Vuetify hides the real checkbox behind the thumb, so the
 * input is the only thing that can be clicked without depending on the skin.
 */
export const setOfflineMode = async (
  page: Page,
  user: TestUser,
  offline: boolean,
): Promise<void> => {
  await openAccountPanel(page, user)
  const input = page.getByTestId('offline-switch').locator('input')

  if (await input.isChecked() !== offline) {
    await input.click()
    await expect(page.getByTestId('connection-chip'))
      .toContainText(offline ? 'Offline mode' : 'Connected', { timeout: 20_000 })
  }

  await closeAccountPanel(page)
}
