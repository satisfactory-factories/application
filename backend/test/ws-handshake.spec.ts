import { CLOSE_CODES, PROTOCOL_VERSION } from 'common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomsService } from '../src/rooms/rooms.service'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, createTestApp, destroyTestApp } from './utils/test-app'
import { TestUser, buildIndexes, call, registerAndLogin, resetRooms } from './utils/rooms'
import { WS_INTERNAL_ERROR } from '../src/realtime/realtime.constants'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'

describe('ws handshake', () => {
  let context: TestContext
  let url: string
  let user: TestUser
  let clients: TestClient[]

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
    user = await registerAndLogin(context.app, 'planner')
  })

  afterEach(() => {
    closeAll(clients)
  })

  const open = async (options?: Parameters<typeof TestClient.open>[1]) => {
    const client = await TestClient.open(url, options)
    clients.push(client)
    return client
  }

  describe('the upgrade', () => {
    it('accepts a request from an allowed web origin', async () => {
      const client = await open({ origin: 'https://satisfactory-factories.app' })

      expect(client.socket.readyState).toBe(1)
    })

    it('accepts a request with no Origin at all (a non-browser client)', async () => {
      const client = await open()

      expect(client.socket.readyState).toBe(1)
    })

    it('rejects a request from an unknown origin with 403', async () => {
      await expect(open({ origin: 'https://evil.example' })).rejects.toThrow(/403/)
    })
  })

  describe('hello', () => {
    it('answers an anonymous hello with a null user and no rooms revision', async () => {
      const client = await open()
      client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION })

      await expect(client.next('hello_ok')).resolves.toEqual({
        type: 'hello_ok',
        protocolVersion: PROTOCOL_VERSION,
        userId: null,
        roomsRevision: null,
        connectionId: expect.any(String),
      })
    })

    it('answers an account hello with the user id and their rooms revision', async () => {
      await call(context.app, 'post', '/rooms', user).send({ name: 'Iron Line' })

      const client = await open()
      client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, token: user.token })
      const ok = await client.next('hello_ok')

      expect(ok.userId).toBe(user.userId)
      expect(ok.roomsRevision).toBe(1)
    })

    it('closes 4426 on a protocol version mismatch', async () => {
      const client = await open()
      client.send({ type: 'hello', protocolVersion: '6.9', token: user.token })

      await expect(client.waitForClose()).resolves.toMatchObject({
        code: CLOSE_CODES.versionMismatch,
      })
    })

    it('closes 4401 on a token that does not verify', async () => {
      const client = await open()
      client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, token: 'not-a-jwt' })

      await expect(client.waitForClose()).resolves.toMatchObject({
        code: CLOSE_CODES.unauthorized,
      })
    })

    it('closes 4401 on a visitor token used as an account token', async () => {
      const roomId = (await call(context.app, 'post', '/rooms', user)
        .send({ name: 'Shared' })).body.room.roomId
      await call(context.app, 'post', `/rooms/${roomId}/share`, user).send({})
      await call(context.app, 'put', `/rooms/${roomId}/password`, user).send({ password: 'ficsit' })
      const { visitorToken } = (await call(context.app, 'post', `/rooms/${roomId}/auth`)
        .send({ password: 'ficsit' })).body

      const client = await open()
      client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, token: visitorToken })

      await expect(client.waitForClose()).resolves.toMatchObject({
        code: CLOSE_CODES.unauthorized,
      })
    })

    it('closes 4401 when the first message is not a hello', async () => {
      const client = await open()
      client.sendRaw({ type: 'join', roomId: 'whatever' })

      await expect(client.waitForClose()).resolves.toMatchObject({
        code: CLOSE_CODES.unauthorized,
      })
    })

    it('closes 4401 when no hello arrives before the deadline', async () => {
      const client = await open()

      await expect(client.waitForClose(15_000)).resolves.toMatchObject({
        code: CLOSE_CODES.unauthorized,
        reason: 'hello timeout',
      })
    }, 20_000)

    it('rejects a second hello without dropping the connection', async () => {
      const client = await open()
      client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION })
      await client.next('hello_ok')

      client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION })

      await expect(client.next('error')).resolves.toMatchObject({ code: 'already_greeted' })
      expect(client.socket.readyState).toBe(1)
    })

    it('answers unparsable JSON with an error rather than a close', async () => {
      const client = await open()
      client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION })
      await client.next('hello_ok')

      client.sendRaw('{ not json')

      await expect(client.next('error')).resolves.toMatchObject({ code: 'invalid_json' })
      expect(client.socket.readyState).toBe(1)
    })
  })

  describe('a database failure during the handshake', () => {
    it('closes retryable (1011), never 4401', async () => {
      const rooms = context.app.get(RoomsService)
      const spy = vi.spyOn(rooms, 'roomsRevisionOf').mockRejectedValue(new Error('mongo is down'))

      const client = await open()
      client.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, token: user.token })
      const closed = await client.waitForClose()

      expect(closed.code).toBe(WS_INTERNAL_ERROR)
      expect(closed.code).not.toBe(CLOSE_CODES.unauthorized)
      spy.mockRestore()
    })
  })
})
