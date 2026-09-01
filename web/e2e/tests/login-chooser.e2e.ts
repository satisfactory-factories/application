import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import { addFactory, createSyncedTab, openPlanner, settle, tabNames } from '../helpers/planner'
import { openAccountPanel, signIn } from '../helpers/session'

/**
 * The login chooser: an interactive sign-in against an account with unopened
 * plans is fronted by a dialog, and "Not now" leaves every one of them off this
 * browser. The open-all path is exercised by the adoption and preferences
 * suites, whose sign-ins accept the same dialog.
 */
test('"Not now" leaves the account plan hidden, and a reload never re-asks', async ({
  client,
  request,
}) => {
  const user = await registerUser(request)

  // The first device runs on a seeded session (a persisted token, no sign-in),
  // which is itself the refresh path: no chooser fronts its planner either.
  const first = await openPlanner(await client({ user }))
  const roomId = await createSyncedTab(first)
  await addFactory(first, { name: 'Cloud only', note: 'made on the first device' })

  // A fresh browser signs in interactively and declines the chooser.
  const second = await openPlanner(await client())
  await signIn(second, user, { chooser: 'not-now' })

  // Nothing opened: the bar still holds only this browser's own tab.
  expect(await tabNames(second)).toEqual(['Default'])

  // A reload is a persisted session, not a sign-in: the chooser must not return.
  await second.reload()
  await settle(second)
  await expect(second.getByTestId('plan-chooser-dialog')).toBeHidden()
  expect(await tabNames(second)).toEqual(['Default'])

  // The plan is untouched on the account, waiting behind the panel's Show button.
  await openAccountPanel(second, user)
  await second.getByTestId('plans-tab-cloud').click()
  await expect(second.locator(`[data-testid="show-plan"][data-room-id="${roomId}"]`)).toBeVisible()
})
