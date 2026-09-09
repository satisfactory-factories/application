import type { Page } from '@playwright/test'
import { expect, test } from '../helpers/fixtures'
import {
  addFactory,
  expectMirroredNote,
  notesField,
  openPlanner,
  waitForRevision,
} from '../helpers/planner'
import { shareARoom } from '../helpers/rooms'
import type { ClientFactory } from '../helpers/rooms'

/**
 * The copy the locked-out client sees, deliberately written out rather than imported:
 * this is the user-facing string, and a test that follows a rename proves nothing.
 */
const LOCK_HINT = 'Another builder is editing this'

/** How long a claim survives with nothing happening to it. */
const TTL_MS = 10_000

/**
 * Seeding a factory leaves the cursor in its notes field, so the seeder is holding a
 * lock before the test has said anything. Handing it back makes "enabled" the state
 * every assertion below starts from.
 */
const seed = async (owner: Page, roomId: string, names: string[]): Promise<void> => {
  for (const name of names) await addFactory(owner, { name, note: `seeded ${name}` })
  // One op, not one per factory: a burst of adds coalesces on the debounce. The joiner
  // waits on the factory count, which is what actually has to be true before it looks.
  await waitForRevision(owner, roomId, 1)
  await notesField(owner).last().blur()
}

const joinAsVisitor = async (
  client: ClientFactory,
  invitePath: string,
  factories: number,
): Promise<Page> => {
  const visitor = await openPlanner(await client(), invitePath)
  await expect(visitor.locator('input.factory-name')).toHaveCount(factories, { timeout: 20_000 })
  return visitor
}

test('a note somebody is typing into cannot be edited by anyone else', async ({
  client,
  request,
}) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)
  await seed(owner, roomId, ['Smelters'])
  const visitor = await joinAsVisitor(client, invitePath, 1)

  const theirs = notesField(visitor).first()
  await expect(theirs, 'the note was locked before anybody was in it').toBeEnabled()

  await notesField(owner).first().click()

  await expect(theirs).toBeDisabled()
  await expect(visitor.getByText(LOCK_HINT)).toBeVisible()

  // The renewal, which is the whole point of repeating the claim: a keystroke every
  // couple of seconds has to carry the lock past the idle window. Real waits, because
  // the ten seconds are real — there is no compressed clock for this one.
  for (let keystroke = 0; keystroke < 6; keystroke++) {
    await notesField(owner).first().press('a')
    await owner.waitForTimeout(TTL_MS / 5)
  }

  await expect(theirs, 'the lock lapsed while its holder was still typing').toBeDisabled()

  await notesField(owner).first().blur()

  await expect(theirs).toBeEnabled()
  await expect(visitor.getByText(LOCK_HINT)).toBeHidden()
})

test('an idle lock lapses on its own, and never covers a second field', async ({
  client,
  request,
}) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)
  await seed(owner, roomId, ['Smelters', 'Constructors'])
  const visitor = await joinAsVisitor(client, invitePath, 2)

  await notesField(owner).first().click()
  await expect(notesField(visitor).first()).toBeDisabled()

  // Locks are per field, so the factory next to it is nobody's and still writes back.
  const elsewhere = 'written while the other note was locked'
  await expect(notesField(visitor).nth(1)).toBeEnabled()
  await notesField(visitor).nth(1).fill(elsewhere)
  await expectMirroredNote(owner, roomId, 'Constructors', elsewhere)

  // Nothing renews the first one, so it lapses. Bounded poll rather than a stopwatch:
  // the holder gives its own claim up on the TTL, and the server's sweep is the backstop.
  await expect(notesField(visitor).first()).toBeEnabled({ timeout: TTL_MS * 2.5 })
})
