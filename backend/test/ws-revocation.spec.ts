import { randomUUID } from 'node:crypto'

import { CLOSE_CODES } from 'common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

describe('ws live access revocation and fan-out', () => {
  let context: TestContext
  let url: string
  let owner: TestUser
  let member: TestUser
  let roomId: string
  let clients: TestClient[]

  const post = (path: string, as?: TestUser) => call(context.app, 'post', path, as)
  const put = (path: string, as?: TestUser) => call(context.app, 'put', path, as)
  const del = (path: string, as?: TestUser) => call(context.app, 'delete', path, as)

  const greet = async (token?: string) => {
    const client = await TestClient.greet(url, token)
    clients.push(client)
    return client
  }

  const joined = async (token?: string, visitorToken?: string) => {
    const client = await greet(token)
    client.send({ type: 'join', roomId, visitorToken })
    await client.next('snapshot')
    await client.next('presence')
    return client
  }

  const visitorToken = async (password: string): Promise<string> =>
    (await post(`/rooms/${roomId}/auth`).send({ password })).body.visitorToken

  beforeAll(async () => {
    context = await createTestApp({ unthrottled: true })
    url = context.wsUrl
    await buildIndexes(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    clients = []
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

  describe('unshare', () => {
    it('closes the anonymous visitor 4403 and leaves the owner connected', async () => {
      const ownerClient = await joined(owner.token)
      const visitor = await joined()

      await post(`/rooms/${roomId}/unshare`, owner)

      await expect(visitor.waitForClose()).resolves.toMatchObject({
        code: CLOSE_CODES.forbidden,
      })
      expect(ownerClient.socket.readyState).toBe(1)
      await expect(ownerClient.next('room_meta')).resolves.toMatchObject({
        roomId,
        meta: { shared: false },
      })
    })

    it('closes a member whose membership was removed with it', async () => {
      const memberClient = await joined(member.token)

      await post(`/rooms/${roomId}/unshare`, owner)

      await expect(memberClient.waitForClose()).resolves.toMatchObject({
        code: CLOSE_CODES.forbidden,
      })
    })
  })

  describe('password rotation', () => {
    beforeEach(async () => {
      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit' })
    })

    it('kicks the visitor holding the old token and keeps the member', async () => {
      const visitor = await joined(undefined, await visitorToken('ficsit'))
      const memberClient = await joined(member.token)

      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit-2' })

      await expect(visitor.waitForClose()).resolves.toMatchObject({
        code: CLOSE_CODES.forbidden,
      })
      expect(memberClient.socket.readyState).toBe(1)
    })

    it('keeps a visitor whose token was minted after the rotation', async () => {
      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit-2' })
      const visitor = await joined(undefined, await visitorToken('ficsit-2'))

      await visitor.expectSilence('error')
      expect(visitor.socket.readyState).toBe(1)
    })
  })

  describe('delete', () => {
    it('tells every socket in the room and drops the room, not the socket', async () => {
      const memberClient = await joined(member.token)

      await del(`/rooms/${roomId}`, owner)

      await expect(memberClient.next('room_deleted')).resolves.toMatchObject({ roomId })
      // One socket carries every synced tab, and 4403 means "stop reconnecting" —
      // closing here would take the user's other tabs down with this one.
      expect(memberClient.socket.readyState).toBe(1)
      await expect(memberClient.next('rooms_changed')).resolves.toMatchObject({
        type: 'rooms_changed',
      })
    })

    it('leaves the socket usable for another room', async () => {
      const other = randomUUID()
      await post('/rooms', member).send({ roomId: other, name: 'Copper Line' })

      const memberClient = await joined(member.token)
      await del(`/rooms/${roomId}`, owner)
      await memberClient.next('room_deleted')

      memberClient.send({ type: 'join', roomId: other })
      await expect(memberClient.next('snapshot')).resolves.toMatchObject({ roomId: other })
    })
  })

  describe('metadata fan-out', () => {
    it('delivers room_meta to sockets joined to the room', async () => {
      const memberClient = await joined(member.token)

      await put(`/rooms/${roomId}/name`, owner).send({ name: 'Steel Line' })

      await expect(memberClient.next('room_meta')).resolves.toMatchObject({
        roomId,
        meta: { name: 'Steel Line', shared: true },
      })
    })

    it('reaches a second member on their user channel without them joining', async () => {
      const memberChannel = await greet(member.token)

      await put(`/rooms/${roomId}/name`, owner).send({ name: 'Steel Line' })

      const changed = await memberChannel.next('rooms_changed')
      expect(changed.roomsRevision).toBeGreaterThan(0)
      const list = await call(context.app, 'get', '/rooms', member)
      expect(list.body.roomsRevision).toBe(changed.roomsRevision)
    })

    it('reaches every one of a user\'s sockets', async () => {
      const first = await greet(member.token)
      const second = await greet(member.token)

      await put(`/rooms/${roomId}/name`, owner).send({ name: 'Steel Line' })

      await expect(first.next('rooms_changed')).resolves.toMatchObject({ type: 'rooms_changed' })
      await expect(second.next('rooms_changed')).resolves.toMatchObject({ type: 'rooms_changed' })
    })
  })
})
