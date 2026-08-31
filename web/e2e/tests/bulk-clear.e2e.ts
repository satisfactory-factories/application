import { BULK_REMOVAL_THRESHOLD } from 'common'

import { expect, test } from '../helpers/fixtures'
import {
  clearPlan,
  mirroredFactories,
  mirrorRevision,
  outstandingIntent,
  waitForRevision,
} from '../helpers/planner'
import { syncedPair } from '../helpers/rooms'

/**
 * "Clear all" replaced the plan's arrays and announced nothing, so the removals were
 * never sent: the other device kept every factory, and the clearing one got them all
 * back at the next rebase.
 *
 * Seeded past `BULK_REMOVAL_THRESHOLD` deliberately, so the clear is a declared bulk removal
 * end to end: undeclared, the server would refuse the op and hand the plan straight back.
 */
const SEED = Array.from(
  { length: BULK_REMOVAL_THRESHOLD + 2 },
  (_unused, index) => `Factory ${index + 1}`,
)

test('clearing every factory on one device empties the other', async ({ client, request }) => {
  const { roomId, first, second } = await syncedPair(client, request, SEED)
  await expect(second.locator('input.factory-name')).toHaveCount(SEED.length)
  const base = await mirrorRevision(first, roomId) as number

  await clearPlan(first)

  // The removals are an op like any other, so the revision has to move for them.
  await waitForRevision(second, roomId, base + 1)
  await expect(second.locator('input.factory-name')).toHaveCount(0)

  for (const page of [first, second]) {
    await expect.poll(() => mirroredFactories(page, roomId), {
      timeout: 30_000,
      message: 'a device still held factories after the plan was cleared',
    }).toEqual([])
    // `expectQuiesced` needs a non-empty plan to compare, so the two halves of it
    // are asserted directly: nothing left unsent, and the same revision on both.
    await expect.poll(() => outstandingIntent(page, roomId), {
      timeout: 30_000,
      message: 'a device still had unsent removals',
    }).toBe(0)
  }

  expect(await mirrorRevision(second, roomId)).toBe(await mirrorRevision(first, roomId))
})
