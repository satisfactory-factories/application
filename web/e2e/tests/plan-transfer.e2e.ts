import { expect, test } from '../helpers/fixtures'
import { addFactory, clearPlan, factoryNames, openPlanner, settle } from '../helpers/planner'

/**
 * A plan leaving the planner and coming back, without an account, a room or a
 * clipboard permission anywhere in it. The clipboard half is driven by the
 * adoption suite, which needs a real one; this is the half a browser can refuse
 * to give you, and the reason the file half exists.
 */
test('a plan saved as a file comes back whole through the file half', async ({ client }) => {
  const page = await openPlanner(await client())
  const actions = page.locator('.sidebar-content')

  await addFactory(page, { name: 'Saved to disk', note: 'and read back' })

  // Copy plan asks where the plan should go; the file half hands over a download.
  await actions.getByTestId('copy-plan').click()
  const download = page.waitForEvent('download')
  await page.getByTestId('copy-to-file').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^satisfactory-.*\.json$/)

  // Emptied, so the plan on screen afterwards can only have come out of the file.
  await clearPlan(page)
  await expect(page.locator('input.factory-name')).toHaveCount(0)

  await actions.getByTestId('import-plan').click()
  await page.getByTestId('import-file-input').setInputFiles(await file.path())
  await settle(page)

  expect(await factoryNames(page)).toEqual(['Saved to disk'])
  // A landed import closes the dialog it came in through.
  await expect(page.getByTestId('import-plan-dialog')).toBeHidden()
})

test('a file that is not a plan says so and leaves the dialog open', async ({ client }) => {
  const page = await openPlanner(await client())
  const actions = page.locator('.sidebar-content')

  await addFactory(page, { name: 'Left alone', note: 'nothing replaces this' })

  await actions.getByTestId('import-plan').click()
  // The confirmation the replace asks for, accepted: the refusal below is the file's.
  page.once('dialog', dialog => void dialog.accept())
  await page.getByTestId('import-file-input').setInputFiles({
    name: 'holiday-snap.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not a plan at all'),
  })

  await expect(page.getByTestId('import-error')).toContainText('does not look like a plan')
  await expect(page.getByTestId('import-plan-dialog')).toBeVisible()
  expect(await factoryNames(page)).toEqual(['Left alone'])
})
