import { randomUUID } from 'node:crypto'

import { CAPS, CLOSE_CODES, FIELD_LOCK_TTL_MS } from 'common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Connection } from 'mongoose'
import type { FieldLock } from 'common'

import { FakeClock, TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { RoomGateway } from '../src/realtime/room.gateway'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

/**
 * Advisory locks: one editor per input, announced to the room and enforced nowhere.
 * The op path never reads them, so every case here is about who is *told* what.
 */
describe('ws field locks', () => {
  let context: TestContext
  let connection: Connection
  let clock: FakeClock
  let gateway: RoomGateway
  let url: string
  let owner: TestUser
  let member: TestUser
  let roomId: string
  let clients: TestClient[]

  const NOTES = 'notes:1'

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)

  const joined = async (token?: string) => {
    const client = await TestClient.greet(url, token)
    clients.push(client)
    client.send({ type: 'join', roomId })
    await client.nextOneOf(['snapshot', 'up_to_date'])
    return client
  }

  /** What the room hands a socket that has just arrived: the whole lock list. */
  const locksSeenByANewSocket = async (): Promise<FieldLock[]> => {
    const watcher = await joined(owner.token)
    try {
      return (await watcher.next('field_locks', 500)).locks
    } catch {
      return []
    }
  }

  /** The epoch write with nothing announcing it: the state a lost kick leaves behind. */
  const revokeSilently = async () => {
    await connection.collection('rooms').updateOne(
      { roomId },
      { $set: { shared: false }, $inc: { membershipEpoch: 1 } },
    )
  }

  beforeAll(async () => {
    clock = new FakeClock()
    context = await createTestApp({ unthrottled: true, clock })
    connection = await awaitConnection(context.app)
    gateway = context.app.get(RoomGateway)
    url = context.wsUrl
    await buildIndexes(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    clients = []
    clock.reset()
    wsConnectionLimiter.reset()
    await resetRooms(context.app)
    owner = await registerAndLogin(context.app, 'owner')
    member = await registerAndLogin(context.app, 'member')
    roomId = randomUUID()
    await post('/rooms', owner).send({ roomId, name: 'Iron Line' })
    await post(`/rooms/${roomId}/share`, owner).send({})
    await post(`/rooms/${roomId}/join`, member).send({})
  })

  afterEach(() => {
    closeAll(clients)
  })

  describe('claiming', () => {
    it('tells the room who holds the field', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })

      await expect(ownerClient.next('field_locks')).resolves.toEqual({
        type: 'field_locks',
        roomId,
        locks: [{ fieldKey: NOTES, holder: memberClient.connectionId }],
      })
      // The holder reads the same frame: its own connectionId is what makes it theirs.
      const mine = await memberClient.next('field_locks')
      expect(mine.locks[0].holder).toBe(memberClient.connectionId)
      expect(mine.locks[0].holder).not.toBe(ownerClient.connectionId)
    })

    it('does not let a second claimant steal a held field', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')
      await memberClient.next('field_locks')

      ownerClient.send({ type: 'lock', roomId, fieldKey: NOTES })

      // Refused by simply not granting it: the last broadcast already said whose it is.
      await ownerClient.expectSilence('field_locks')
      await expect(locksSeenByANewSocket()).resolves.toEqual([
        { fieldKey: NOTES, holder: memberClient.connectionId },
      ])
    })

    it('leaves a field somebody else holds alone and takes the one beside it', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')

      ownerClient.send({ type: 'lock', roomId, fieldKey: 'notes:2' })

      const locks = (await ownerClient.next('field_locks')).locks
      expect(locks).toHaveLength(2)
      expect(locks).toContainEqual({ fieldKey: NOTES, holder: memberClient.connectionId })
      expect(locks).toContainEqual({ fieldKey: 'notes:2', holder: ownerClient.connectionId })
    })

    it('refuses a claim on a room the socket has not joined', async () => {
      const client = await TestClient.greet(url, owner.token)
      clients.push(client)

      client.send({ type: 'lock', roomId, fieldKey: NOTES })

      await expect(client.next('error')).resolves.toMatchObject({ code: 'not_joined', roomId })
    })
  })

  describe('releasing', () => {
    it('releases on unlock, the way a blur does', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')

      memberClient.send({ type: 'unlock', roomId, fieldKey: NOTES })

      await expect(ownerClient.next('field_locks')).resolves.toMatchObject({ roomId, locks: [] })
    })

    it('ignores an unlock aimed at somebody else\'s lock', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')

      ownerClient.send({ type: 'unlock', roomId, fieldKey: NOTES })

      await ownerClient.expectSilence('field_locks')
      await expect(locksSeenByANewSocket()).resolves.toEqual([
        { fieldKey: NOTES, holder: memberClient.connectionId },
      ])
    })

    it('releases every lock a socket held when it disconnects', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')
      memberClient.send({ type: 'lock', roomId, fieldKey: 'notes:2' })
      await ownerClient.next('field_locks')

      memberClient.close()

      await expect(ownerClient.next('field_locks')).resolves.toMatchObject({ locks: [] })
    })

    it('releases the locks of a socket that leaves the room', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')

      memberClient.send({ type: 'leave', roomId })

      await expect(ownerClient.next('field_locks')).resolves.toMatchObject({ locks: [] })
      // The socket is only dropped from the room; the tabs riding it are untouched.
      expect(memberClient.socket.readyState).toBe(1)
    })

    it('releases the locks of a socket the room kicked', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')

      await post(`/rooms/${roomId}/unshare`, owner)

      await expect(memberClient.waitForClose()).resolves.toMatchObject({
        code: CLOSE_CODES.forbidden,
      })
      await expect(ownerClient.next('field_locks')).resolves.toMatchObject({ locks: [] })
    })
  })

  describe('expiry', () => {
    it('releases a lock nobody renewed, and not a moment before', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')

      clock.advance(FIELD_LOCK_TTL_MS - 1)
      gateway.sweepFieldLocks()
      await ownerClient.expectSilence('field_locks')

      clock.advance(1)
      gateway.sweepFieldLocks()

      await expect(ownerClient.next('field_locks')).resolves.toMatchObject({ roomId, locks: [] })
    })

    it('pushes the line back on every renewal', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')

      clock.advance(FIELD_LOCK_TTL_MS - 1)
      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      // A renewal moves nothing anybody can see, so it costs no frame either.
      await ownerClient.expectSilence('field_locks')

      clock.advance(FIELD_LOCK_TTL_MS - 1)
      gateway.sweepFieldLocks()
      await ownerClient.expectSilence('field_locks')

      clock.advance(1)
      gateway.sweepFieldLocks()

      await expect(ownerClient.next('field_locks')).resolves.toMatchObject({ locks: [] })
    })

    it('hands an expired field to the next claimant without waiting for the sweep', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await ownerClient.next('field_locks')

      clock.advance(FIELD_LOCK_TTL_MS)
      ownerClient.send({ type: 'lock', roomId, fieldKey: NOTES })

      await expect(ownerClient.next('field_locks')).resolves.toMatchObject({
        locks: [{ fieldKey: NOTES, holder: ownerClient.connectionId }],
      })
    })
  })

  describe('joining', () => {
    it('tells a late joiner what the room already holds', async () => {
      const memberClient = await joined(member.token)
      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await memberClient.next('field_locks')

      const latecomer = await joined(owner.token)

      await expect(latecomer.next('field_locks')).resolves.toEqual({
        type: 'field_locks',
        roomId,
        locks: [{ fieldKey: NOTES, holder: memberClient.connectionId }],
      })
    })

    it('says nothing to a joiner when the room holds no locks', async () => {
      const client = await joined(owner.token)

      await client.expectSilence('field_locks')
    })
  })

  describe('caps', () => {
    it('stops one socket holding more than its share', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)

      for (let index = 0; index < CAPS.fieldLocksPerConnection; index++) {
        memberClient.send({ type: 'lock', roomId, fieldKey: `notes:${index}` })
        await ownerClient.next('field_locks')
      }

      memberClient.send({ type: 'lock', roomId, fieldKey: 'notes:one-too-many' })

      await ownerClient.expectSilence('field_locks')
      await expect(locksSeenByANewSocket()).resolves.toHaveLength(CAPS.fieldLocksPerConnection)
    })

    it('refuses a field key longer than the cap', async () => {
      const client = await joined(owner.token)

      client.sendRaw({ type: 'lock', roomId, fieldKey: 'x'.repeat(CAPS.fieldKey + 1) })

      await expect(client.next('error')).resolves.toMatchObject({ code: 'invalid_message' })
      await client.expectSilence('field_locks')
    })
  })

  describe('access', () => {
    it('refuses a claim from a socket whose access went away unannounced', async () => {
      const ownerClient = await joined(owner.token)
      const memberClient = await joined(member.token)
      await revokeSilently()

      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })

      await expect(memberClient.next('error')).resolves.toMatchObject({ code: 'forbidden', roomId })
      await ownerClient.expectSilence('field_locks')
      // Dropped from the room, so the next attempt is not even in it.
      memberClient.send({ type: 'lock', roomId, fieldKey: NOTES })
      await expect(memberClient.next('error')).resolves.toMatchObject({ code: 'not_joined' })
    })
  })
})
