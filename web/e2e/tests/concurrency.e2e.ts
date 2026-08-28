import { expect, test } from '../helpers/fixtures'
import {
  addFactory,
  expectQuiesced,
  mirroredFactories,
  mirroredNote,
  mirrorRevision,
  setFactoryNote,
  waitForRevision,
} from '../helpers/planner'
import { syncedPair } from '../helpers/rooms'
import type { SyncedPair } from '../helpers/rooms'

/**
 * The state before the race is itself a converged one, so every assertion waits
 * for the revision to move first. `accepted` is how many of the two ops the
 * server must have taken for the case to have been exercised at all.
 */
const raceResolved = async (
  { roomId, first, second }: SyncedPair,
  baseRevision: number,
  accepted: number,
): Promise<void> => {
  for (const page of [first, second]) {
    await waitForRevision(page, roomId, baseRevision + accepted)
  }
  await expectQuiesced([first, second], roomId)
}

const factoryNamesIn = async (
  ...args: Parameters<typeof mirroredFactories>
): Promise<string[]> => (await mirroredFactories(...args)).map(factory => factory.name).sort()

test('two clients editing the same factory converge on one winner', async ({
  client,
  request,
}) => {
  const pair = await syncedPair(client, request, ['Contested'])
  const { roomId, first, second } = pair
  const base = await mirrorRevision(first, roomId) as number

  const fromFirst = 'the first device got there'
  const fromSecond = 'the second device got there'

  await Promise.all([
    setFactoryNote(first, 0, fromFirst),
    setFactoryNote(second, 0, fromSecond),
  ])

  // One accepted op is the floor here: the two edits collide on one record, and
  // the plan's rule for that is last write wins.
  await raceResolved(pair, base, 1)

  // Which one won is the server's business; that they agree is the contract.
  await expect.poll(() => mirroredNote(first, roomId, 'Contested'), {
    message: 'neither concurrent edit survived',
  }).toMatch(new RegExp(`^(${fromFirst}|${fromSecond})$`))

  const winner = await mirroredNote(first, roomId, 'Contested')
  expect(await mirroredNote(second, roomId, 'Contested')).toBe(winner)
})

/**
 * Each client creates a record of its own, which is the one per-factory edit the
 * engine records as *intent* — the only thing a rebase is allowed to overlay. A
 * notes edit does not qualify (`PlannerFactoryNotes.vue` emits `factoryUpdated`,
 * never `factoryEdited`), so a client whose note collides with an inbound op has
 * it dropped rather than rebased. See the report on that defect.
 */
test('two clients adding a factory each keep both of them', async ({ client, request }) => {
  const pair = await syncedPair(client, request)
  const { roomId, first, second } = pair
  const base = await mirrorRevision(first, roomId) as number

  await Promise.all([
    addFactory(first, { name: 'Alpha', note: 'added on the first device' }),
    addFactory(second, { name: 'Bravo', note: 'added on the second device' }),
  ])

  // Different records, so both ops have to be taken; neither may be swallowed.
  await raceResolved(pair, base, 2)

  for (const page of [first, second]) {
    await expect.poll(() => factoryNamesIn(page, roomId), {
      message: 'a device lost one of the two additions',
    }).toEqual(['Alpha', 'Bravo'])
    expect(await mirroredNote(page, roomId, 'Alpha')).toBe('added on the first device')
    expect(await mirroredNote(page, roomId, 'Bravo')).toBe('added on the second device')
  }
})
