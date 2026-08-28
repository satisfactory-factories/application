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
 * An add is structural, so the engine infers the intent from the diff itself. This
 * is the case that needs no UI to declare anything.
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

/**
 * The content edit that carries no structural signal: only the notes card saying
 * so makes it intent. Without that, the loser's note is dropped by the rebase
 * rather than carried onto the snapshot, and one of the two is simply lost.
 */
test('two clients annotating different factories keep both notes', async ({ client, request }) => {
  const pair = await syncedPair(client, request, ['Smelters', 'Constructors'])
  const { roomId, first, second } = pair
  const base = await mirrorRevision(first, roomId) as number

  await Promise.all([
    setFactoryNote(first, 0, 'the first device wrote this'),
    setFactoryNote(second, 1, 'the second device wrote this'),
  ])

  // Different records again, so neither op may be swallowed.
  await raceResolved(pair, base, 2)

  for (const page of [first, second]) {
    expect(await mirroredNote(page, roomId, 'Smelters')).toBe('the first device wrote this')
    expect(await mirroredNote(page, roomId, 'Constructors')).toBe('the second device wrote this')
  }
})
