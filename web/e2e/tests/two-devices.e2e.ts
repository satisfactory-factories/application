import { isDeepStrictEqual } from 'node:util'

import { expect, test } from '../helpers/fixtures'
import { unique } from '../helpers/accounts'
import {
  addFactory,
  mirroredFactories,
  mirrorRevision,
  notesField,
  readTabBar,
  waitForRevision,
} from '../helpers/planner'
import { syncedPair } from '../helpers/rooms'

test('an edit on one device reaches the account\'s other device within 2s', async ({
  client,
  request,
}) => {
  const { roomId, first, second } = await syncedPair(client, request)

  // The room list is what tells the second device the tab exists at all.
  expect(await readTabBar(second)).toContainEqual(
    expect.objectContaining({ kind: 'synced', selected: true }),
  )

  const name = unique('Alpha')
  const note = `written on the first device: ${name}`
  await addFactory(first, { name, note })

  await expect(second.locator('input.factory-name')).toHaveValue(name, { timeout: 2_000 })
  await expect(notesField(second)).toHaveValue(note, { timeout: 2_000 })
  expect(await mirrorRevision(second, roomId)).toBeGreaterThan(0)
})

test('both devices hold deep-equal plans once the edits quiesce', async ({ client, request }) => {
  const { roomId, first, second } = await syncedPair(client, request)

  const name = unique('Bravo')
  await addFactory(first, { name, note: `quiesce ${name}` })
  await expect(second.locator('input.factory-name')).toHaveValue(name)

  // Quiesced means both sides acknowledged the same revision, not "we waited".
  await expect.poll(() => mirrorRevision(first, roomId)).toBeGreaterThan(0)
  const revision = await mirrorRevision(first, roomId) as number
  await waitForRevision(second, roomId, revision)

  await expect.poll(async () => {
    const [ours, theirs] = await Promise.all([
      mirroredFactories(first, roomId),
      mirroredFactories(second, roomId),
    ])
    return ours.length > 0 && isDeepStrictEqual(ours, theirs)
  }, { message: 'the two mirrors never converged' }).toBe(true)

  // Repeated as a plain assertion so a regression prints the differing plan.
  expect(await mirroredFactories(second, roomId)).toEqual(
    await mirroredFactories(first, roomId),
  )
})
