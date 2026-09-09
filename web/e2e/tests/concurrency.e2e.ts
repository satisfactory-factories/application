import type { Page } from '@playwright/test'

import { registerUser } from '../helpers/accounts'
import { expect, test } from '../helpers/fixtures'
import { installWsGate } from '../helpers/network'
import type { WsGate } from '../helpers/network'
import {
  addFactory,
  createSyncedTab,
  expectMirroredNote,
  expectQuiesced,
  mirroredFactories,
  mirroredNote,
  mirrorRevision,
  openPlanner,
  outstandingIntent,
  selectTab,
  setFactoryNote,
  waitForRevision,
} from '../helpers/planner'
import { showPlan } from '../helpers/rooms'
import type { ClientFactory } from '../helpers/rooms'
import type { TestUser } from '../helpers/accounts'

/**
 * The contract these tests exist for: the server takes an op only at the exact revision it
 * was built against, so same-factory ties are last write wins and different factories both
 * survive through a rebase.
 *
 * Firing two UI actions off together does not exercise it. One client's op is routinely
 * accepted and broadcast before the other has finished building its own, and then nothing
 * collided: a fully sequential run converges, and a suite that only checks convergence calls
 * that a pass. So both clients' first op is held at the socket here, both are checked to
 * carry the same `baseRevision`, and only then are they let go together. One of them has to
 * come back `stale_base`, and the rebase that follows is the thing being proved.
 */

interface GatedPair {
  user: TestUser
  roomId: string
  first: Page
  second: Page
  firstGate: WsGate
  secondGate: WsGate
}

interface OpFrame extends Record<string, unknown> {
  type: string
  baseRevision: number
}

/** `syncedPair`, with a gate on each device's socket so its ops can be held. */
const gatedPair = async (
  client: ClientFactory,
  request: Parameters<typeof registerUser>[0],
  seed: string[] = [],
): Promise<GatedPair> => {
  const user = await registerUser(request)

  let firstGate!: WsGate
  const first = await openPlanner(await client({ user }), '/', async page => {
    firstGate = await installWsGate(page)
  })
  const roomId = await createSyncedTab(first)
  for (const name of seed) await addFactory(first, { name, note: `seeded ${name}` })

  let secondGate!: WsGate
  const second = await openPlanner(await client({ user }), '/', async page => {
    secondGate = await installWsGate(page)
  })
  await showPlan(second, user, roomId)
  await selectTab(second, roomId)
  await expect(second.locator('input.factory-name')).toHaveCount(seed.length, { timeout: 20_000 })

  return { user, roomId, first, second, firstGate, secondGate }
}

/**
 * The revision both devices are idle at. `expectConverged` cannot answer this: it needs a
 * non-empty plan, and half of these races start from an empty room.
 */
const settledRevision = async ({ roomId, first, second }: GatedPair): Promise<number> => {
  await expect.poll(async () => {
    const revisions = await Promise.all([first, second].map(page => mirrorRevision(page, roomId)))
    const intent = await Promise.all([first, second].map(page => outstandingIntent(page, roomId)))
    return revisions[0] !== null && revisions[0] === revisions[1] && intent.every(count => count === 0)
  }, {
    timeout: 30_000,
    message: 'the two devices never agreed on a revision to race from',
  }).toBe(true)

  return await mirrorRevision(first, roomId) as number
}

const opsSent = (gate: WsGate): OpFrame[] =>
  gate.sent().filter(frame => frame.type === 'op') as OpFrame[]

const staleRejects = (gate: WsGate): Record<string, unknown>[] =>
  gate.received().filter(frame => frame.type === 'op_reject' && frame.reason === 'stale_base')

/**
 * Holds both devices' next op, checks they were built against the same revision, and releases
 * them together. That check is what separates a collision from a queue.
 */
const raceOneOpEach = async (
  pair: GatedPair,
  edits: () => Promise<unknown>,
  baseRevision: number,
): Promise<void> => {
  const firstOp = pair.firstGate.stallOps()
  const secondOp = pair.secondGate.stallOps()

  await edits()

  const [fromFirst, fromSecond] = await Promise.all([firstOp, secondOp]) as OpFrame[]

  // The whole point. Two ops built against the same state, neither yet seen by the server:
  // without this the "race" is satisfied by one device finishing before the other starts.
  expect(fromFirst.baseRevision, 'the first device did not build its op against the shared revision')
    .toBe(baseRevision)
  expect(fromSecond.baseRevision, 'the second device did not build its op against the shared revision')
    .toBe(baseRevision)

  pair.firstGate.releaseOps()
  pair.secondGate.releaseOps()
}

/** Which device the server refused, once exactly one of them has been refused. */
const rejectedDevice = async (pair: GatedPair): Promise<'first' | 'second'> => {
  await expect.poll(
    () => staleRejects(pair.firstGate).length + staleRejects(pair.secondGate).length,
    { timeout: 30_000, message: 'neither op was refused, so the two never actually collided' },
  ).toBe(1)

  return staleRejects(pair.firstGate).length === 1 ? 'first' : 'second'
}

/** The refused device rebased and sent again, which is the path the contract rests on. */
const expectRebaseResend = async (
  gate: WsGate,
  baseRevision: number,
): Promise<void> => {
  await expect.poll(
    () => opsSent(gate).filter(op => op.baseRevision > baseRevision).length,
    { timeout: 30_000, message: 'the refused device never resent its edit on the new revision' },
  ).toBeGreaterThan(0)
}

const factoryNamesIn = async (
  ...args: Parameters<typeof mirroredFactories>
): Promise<string[]> => (await mirroredFactories(...args)).map(factory => factory.name).sort()

test('two clients editing the same factory land on the later write', async ({ client, request }) => {
  const pair = await gatedPair(client, request, ['Contested'])
  const { roomId, first, second, firstGate, secondGate } = pair
  const base = await settledRevision(pair)

  const notes = { first: 'the first device got there', second: 'the second device got there' }

  await raceOneOpEach(pair, () => Promise.all([
    setFactoryNote(first, 0, notes.first),
    setFactoryNote(second, 0, notes.second),
  ]), base)

  const refused = await rejectedDevice(pair)
  await expectRebaseResend(refused === 'first' ? firstGate : secondGate, base)

  // Last write wins, and with the collision forced the winner is not a coin toss: the op the
  // server took first is superseded by the refused device's rebase, which adopts that state,
  // overlays the edit its user actually made and sends it on the revision that op created.
  // Two ops are therefore committed, and the note that survives is the refused device's.
  for (const page of [first, second]) await waitForRevision(page, roomId, base + 2)
  await expectQuiesced([first, second], roomId)

  await expectMirroredNote(first, roomId, 'Contested', notes[refused])
  await expectMirroredNote(second, roomId, 'Contested', notes[refused])
})

/**
 * An add is structural, so the engine infers the intent from the diff itself. This
 * is the case that needs no UI to declare anything.
 *
 * The one exception to this file's zero retries: `addFactory` is four real actions
 * (add, name, commit, note), and on a loaded runner they can occasionally straddle
 * the 400ms sync debounce, sending the name and the note as two ops instead of one.
 * That desyncs the race this test forces, not the server's own collision handling —
 * the other three tests here exercise the same server-side rule with a single-action
 * edit and have never flaked. Confirmed by reading `room-op.service.ts`'s commit
 * path (an atomic, revision-filtered update — no scenario double-accepts) and by
 * repeated local reproduction: the failure is always this test's own bookkeeping
 * ("neither op was refused"), never a wrong result reaching either device.
 */
test.describe(() => {
  test.describe.configure({ retries: 1 })

  test('two clients adding a factory each keep both of them', async ({ client, request }) => {
    const pair = await gatedPair(client, request)
    const { roomId, first, second, firstGate, secondGate } = pair
    const base = await settledRevision(pair)

    await raceOneOpEach(pair, () => Promise.all([
      addFactory(first, { name: 'Alpha', note: 'added on the first device' }),
      addFactory(second, { name: 'Bravo', note: 'added on the second device' }),
    ]), base)

    const refused = await rejectedDevice(pair)
    await expectRebaseResend(refused === 'first' ? firstGate : secondGate, base)

    // Different records, so both ops have to be committed; neither may be swallowed.
    for (const page of [first, second]) await waitForRevision(page, roomId, base + 2)
    await expectQuiesced([first, second], roomId)

    for (const page of [first, second]) {
      await expect.poll(() => factoryNamesIn(page, roomId), {
        message: 'a device lost one of the two additions',
      }).toEqual(['Alpha', 'Bravo'])
      await expectMirroredNote(page, roomId, 'Alpha', 'added on the first device')
      await expectMirroredNote(page, roomId, 'Bravo', 'added on the second device')
    }
  })
})

/**
 * The content edit that carries no structural signal: only the notes card saying
 * so makes it intent. Without that, the loser's note is dropped by the rebase
 * rather than carried onto the snapshot, and one of the two is simply lost.
 */
test('two clients annotating different factories keep both notes', async ({ client, request }) => {
  const pair = await gatedPair(client, request, ['Smelters', 'Constructors'])
  const { roomId, first, second, firstGate, secondGate } = pair
  const base = await settledRevision(pair)

  await raceOneOpEach(pair, () => Promise.all([
    setFactoryNote(first, 0, 'the first device wrote this'),
    setFactoryNote(second, 1, 'the second device wrote this'),
  ]), base)

  const refused = await rejectedDevice(pair)
  await expectRebaseResend(refused === 'first' ? firstGate : secondGate, base)

  for (const page of [first, second]) await waitForRevision(page, roomId, base + 2)
  await expectQuiesced([first, second], roomId)

  for (const page of [first, second]) {
    await expectMirroredNote(page, roomId, 'Smelters', 'the first device wrote this')
    await expectMirroredNote(page, roomId, 'Constructors', 'the second device wrote this')
  }
})

/**
 * The negative control for the gate itself. A refused op must be refused for being stale and
 * nothing else, and the device that was taken must never see a rejection: without this the
 * tests above would pass just as well on a server that refused everything.
 */
test('only the second op is refused, and only for its revision', async ({ client, request }) => {
  const pair = await gatedPair(client, request, ['Contested'])
  const { roomId, first, second, firstGate, secondGate } = pair
  const base = await settledRevision(pair)

  await raceOneOpEach(pair, () => Promise.all([
    setFactoryNote(first, 0, 'one'),
    setFactoryNote(second, 0, 'two'),
  ]), base)

  const refused = await rejectedDevice(pair)
  const accepted = refused === 'first' ? secondGate : firstGate

  for (const page of [first, second]) await waitForRevision(page, roomId, base + 2)
  await expectQuiesced([first, second], roomId)

  const rejections = (gate: WsGate) => gate.received().filter(frame => frame.type === 'op_reject')
  expect(rejections(accepted), 'the device the server took was refused as well').toEqual([])
  expect(rejections(refused === 'first' ? firstGate : secondGate).map(frame => frame.reason))
    .toEqual(['stale_base'])

  // And the note is still one of the two, rather than something a failed merge invented.
  await expect.poll(() => mirroredNote(first, roomId, 'Contested')).toMatch(/^(one|two)$/)
})
