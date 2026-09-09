import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import {
  addFactory,
  expectTabKind,
  mirroredNote,
  mirrorRevision,
  openPlanner,
  selectTab,
  waitForRevision,
  waitForTab,
} from '../helpers/planner'
import { shareARoom, stopSharing } from '../helpers/rooms'

test('unsharing leaves the collaborator a local copy of the last state', async ({
  client,
  request,
}) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)
  const lastState = 'the last state before it was unshared'
  await addFactory(owner, { name: 'Handover', note: lastState })
  await waitForRevision(owner, roomId, 1)

  const memberUser = await registerUser(request)
  const member = await openPlanner(await client({ user: memberUser }), invitePath)
  await waitForTab(member, roomId)
  await selectTab(member, roomId)
  await expect(member.locator('input.factory-name')).toHaveValue('Handover')

  await selectTab(owner, roomId)
  await stopSharing(owner)

  // Data kept, live link dead: both halves of the plan's revocation promise.
  await expectTabKind(member, roomId, 'local')
  await expect.poll(() => mirroredNote(member, roomId, 'Handover'), {
    message: 'the collaborator\'s copy lost the last state',
  }).toBe(lastState)
  await expect.poll(() => mirrorRevision(member, roomId), {
    message: 'the room\'s sync metadata outlived the membership',
  }).toBeNull()

  // The owner still has it, privately.
  await expectTabKind(owner, roomId, 'synced')
})
