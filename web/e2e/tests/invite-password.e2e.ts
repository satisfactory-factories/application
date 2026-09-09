import { expect, test } from '../helpers/fixtures'
import { registerUser } from '../helpers/accounts'
import {
  addFactory,
  expectMirroredNote,
  expectTabKind,
  mirroredFactories,
  selectTab,
  setFactoryNote,
  settle,
  waitForRevision,
  waitForTab,
} from '../helpers/planner'
import { openInvite, setInvitePassword, shareARoom, submitInvitePassword } from '../helpers/rooms'

test('a wrong invite password is refused on the form, and the right one joins', async ({
  client,
  request,
}) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)
  await addFactory(owner, { name: 'Locked', note: 'behind a password' })
  await waitForRevision(owner, roomId, 1)
  await setInvitePassword(owner, 'first-password')

  const visitor = await openInvite(await client(), invitePath)
  await submitInvitePassword(visitor, 'not-the-password')

  await expect(visitor.getByTestId('room-error')).toHaveText('Incorrect password. Please try again.')
  // A refusal must never bounce the visitor anywhere; the form stays put.
  await expect(visitor.getByTestId('room-password')).toBeVisible()

  await submitInvitePassword(visitor, 'first-password')
  await settle(visitor)

  await expect(visitor.locator('input.factory-name')).toHaveValue('Locked')
  await expectTabKind(visitor, roomId, 'collaborative')
})

test('rotating the password kicks the anonymous visitor and keeps the member', async ({
  client,
  request,
}) => {
  const { roomId, owner, invitePath } = await shareARoom(client, request)
  await addFactory(owner, { name: 'Rotating', note: 'before the rotation' })
  await waitForRevision(owner, roomId, 1)
  await setInvitePassword(owner, 'first-password')

  // Signed in: clears the password once, then holds a durable membership.
  const memberUser = await registerUser(request)
  const member = await openInvite(await client({ user: memberUser }), invitePath)
  await submitInvitePassword(member, 'first-password')
  await settle(member)
  await waitForTab(member, roomId)
  await expectTabKind(member, roomId, 'collaborative')

  // Signed out: holds nothing but a visitor token stamped with the password version.
  const visitor = await openInvite(await client(), invitePath)
  await submitInvitePassword(visitor, 'first-password')
  await settle(visitor)
  await expectTabKind(visitor, roomId, 'collaborative')

  await setInvitePassword(owner, 'second-password')

  // The visitor's token is dead, so the live link dies and the plan stays put.
  await expectTabKind(visitor, roomId, 'local')
  await expect.poll(async () =>
    (await mirroredFactories(visitor, roomId)).map(factory => factory.name),
  { message: 'the kicked visitor lost the plan' },
  ).toEqual(['Rotating'])

  // The member was never re-prompted, and is still receiving the owner's edits.
  await expectTabKind(member, roomId, 'collaborative')
  await selectTab(owner, roomId)
  await setFactoryNote(owner, 0, 'after the rotation')
  await expectMirroredNote(member, roomId, 'Rotating', 'after the rotation')
})
