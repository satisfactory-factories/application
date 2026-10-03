import { expect, test } from '../helpers/fixtures'
import { addFactory, factoryNames, openPlanner } from '../helpers/planner'

/**
 * Nearly every test in this suite adds a factory, so `addNamedFactory` failing takes
 * whatever test was running down with it, saying nothing about what that test was
 * for. It found the new card by the focus the app puts in its name field, and under
 * load that focus is the flakiest thing in the suite: four runs in one afternoon died
 * on "the new factory never focused its name field", in four unrelated files.
 *
 * It falls back to the plan's own ids now. This holds that fallback in place by
 * taking the focus away on purpose, which is the one way to be sure the fallback is
 * doing something rather than sitting behind a path that always works.
 */
test('a factory added while focus is being stolen still lands', async ({ client }) => {
  const page = await openPlanner(await client())

  // The flake, on purpose: for the length of the add, a name field that takes
  // focus loses it again. This is what the suite has hit four times today under
  // load, and what used to fail whatever test happened to be running.
  await page.evaluate(() => {
    const win = window as unknown as { __steal?: boolean }
    win.__steal = true
    document.addEventListener('focusin', event => {
      const target = event.target as HTMLElement
      if (win.__steal && target?.matches?.('input.factory-name')) target.blur()
    }, true)
    setTimeout(() => { win.__steal = false }, 1500)
  })

  await addFactory(page, { name: 'Focus never landed', note: 'and it still worked' })

  expect(await factoryNames(page)).toEqual(['Focus never landed'])
})
