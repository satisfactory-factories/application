import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

describe('ws join, snapshots and presence', () => {
  let context: TestContext
  let url: string
  let owner: TestUser
  let stranger: TestUser
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

  beforeAll(async () => {
    context = await createTestApp({ unthrottled: true, listen: true })
    url = context.wsUrl as string
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
    stranger = await registerAndLogin(context.app, 'stranger')
    roomId = randomUUID()
    await post('/rooms', owner).send({ roomId, name: 'Iron Line' })
  })

  afterEach(() => {
    closeAll(clients)
  })

  describe('access', () => {
    it('sends the owner a snapshot of the room', async () => {
      const client = await greet(owner.token)
      client.send({ type: 'join', roomId })

      const snapshot = await client.next('snapshot')
      expect(snapshot.roomId).toBe(roomId)
      expect(snapshot.revision).toBe(0)
      expect(snapshot.room).toMatchObject({ roomId, name: 'Iron Line', shared: false })
      expect(snapshot.room).not.toHaveProperty('passwordHash')
    })

    it('answers up_to_date when the client already holds the revision', async () => {
      const client = await greet(owner.token)
      client.send({ type: 'join', roomId, lastRevision: 0 })

      await expect(client.next('up_to_date')).resolves.toMatchObject({ roomId, revision: 0 })
      await client.expectSilence('snapshot')
    })

    it('refuses a stranger on a private room', async () => {
      const client = await greet(stranger.token)
      client.send({ type: 'join', roomId })

      await expect(client.next('error')).resolves.toMatchObject({ code: 'forbidden', roomId })
    })

    it('errors on a room that does not exist', async () => {
      const client = await greet(owner.token)
      client.send({ type: 'join', roomId: randomUUID() })

      await expect(client.next('error')).resolves.toMatchObject({ code: 'room_not_found' })
    })

    it('answers room_deleted for a tombstoned room', async () => {
      await del(`/rooms/${roomId}`, owner)

      const client = await greet(owner.token)
      client.send({ type: 'join', roomId })

      await expect(client.next('room_deleted')).resolves.toMatchObject({ roomId })
    })

    it('lets an anonymous visitor into a shared room with no password', async () => {
      await post(`/rooms/${roomId}/share`, owner).send({})

      const client = await greet()
      client.send({ type: 'join', roomId })

      await expect(client.next('snapshot')).resolves.toMatchObject({ roomId })
    })

    it('refuses an anonymous visitor with no token once a password is set', async () => {
      await post(`/rooms/${roomId}/share`, owner).send({})
      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit' })

      const client = await greet()
      client.send({ type: 'join', roomId })

      await expect(client.next('error')).resolves.toMatchObject({ code: 'forbidden' })
    })

    it('lets an anonymous visitor in with a current visitor token', async () => {
      await post(`/rooms/${roomId}/share`, owner).send({})
      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit' })
      const { visitorToken } = (await post(`/rooms/${roomId}/auth`).send({ password: 'ficsit' })).body

      const client = await greet()
      client.send({ type: 'join', roomId, visitorToken })

      await expect(client.next('snapshot')).resolves.toMatchObject({ roomId })
    })

    it('refuses a visitor token minted before a password rotation', async () => {
      await post(`/rooms/${roomId}/share`, owner).send({})
      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit' })
      const { visitorToken } = (await post(`/rooms/${roomId}/auth`).send({ password: 'ficsit' })).body
      await put(`/rooms/${roomId}/password`, owner).send({ password: 'ficsit-2' })

      const client = await greet()
      client.send({ type: 'join', roomId, visitorToken })

      await expect(client.next('error')).resolves.toMatchObject({ code: 'forbidden' })
    })

    it('lets a member in after they join over REST', async () => {
      await post(`/rooms/${roomId}/share`, owner).send({})
      await post(`/rooms/${roomId}/join`, stranger).send({})

      const client = await greet(stranger.token)
      client.send({ type: 'join', roomId })

      await expect(client.next('snapshot')).resolves.toMatchObject({ roomId })
    })
  })

  describe('presence', () => {
    it('counts each socket in the room and recounts on leave', async () => {
      const first = await greet(owner.token)
      first.send({ type: 'join', roomId })
      await first.next('snapshot')
      await expect(first.next('presence')).resolves.toMatchObject({ roomId, count: 1 })

      const second = await greet(owner.token)
      second.send({ type: 'join', roomId })
      await second.next('snapshot')

      await expect(first.next('presence')).resolves.toMatchObject({ count: 2 })
      await expect(second.next('presence')).resolves.toMatchObject({ count: 2 })

      second.send({ type: 'leave', roomId })
      await expect(first.next('presence')).resolves.toMatchObject({ count: 1 })
    })

    it('recounts when a socket disconnects without leaving', async () => {
      const watcher = await greet(owner.token)
      watcher.send({ type: 'join', roomId })
      await watcher.next('presence')

      const transient = await greet(owner.token)
      transient.send({ type: 'join', roomId })
      await expect(watcher.next('presence')).resolves.toMatchObject({ count: 2 })

      transient.close()
      await expect(watcher.next('presence')).resolves.toMatchObject({ count: 1 })
    })
  })
})
