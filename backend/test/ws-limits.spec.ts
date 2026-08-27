import { PROTOCOL_VERSION } from 'common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ConnectionRegistry } from '../src/realtime/connection-registry'
import { RoomGateway } from '../src/realtime/room.gateway'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, createTestApp, destroyTestApp } from './utils/test-app'
import { buildIndexes, resetRooms } from './utils/rooms'
import { wsConnectionLimiter } from '../src/realtime/ws-throttle'
import {
  WS_CONNECTION_LIMIT,
  WS_MAX_PAYLOAD_BYTES,
  WS_MESSAGE_LIMIT,
  WS_POLICY_VIOLATION,
} from '../src/realtime/realtime.constants'

/** ws answers an over-long message with this before any handler sees it. */
const WS_MESSAGE_TOO_BIG = 1009

const settle = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms))

describe('ws limits and heartbeat', () => {
  let context: TestContext
  let url: string
  let clients: TestClient[]

  const greet = async () => {
    const client = await TestClient.greet(url)
    clients.push(client)
    return client
  }

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
  })

  afterEach(() => {
    closeAll(clients)
    wsConnectionLimiter.reset()
  })

  it('closes 1009 on a message past maxPayload', async () => {
    const client = await greet()

    client.sendRaw('x'.repeat(WS_MAX_PAYLOAD_BYTES + 1024))

    await expect(client.waitForClose(15_000)).resolves.toMatchObject({
      code: WS_MESSAGE_TOO_BIG,
    })
  }, 30_000)

  it('closes 1008 once a socket exceeds its message rate', async () => {
    const client = await greet()

    for (let sent = 0; sent < WS_MESSAGE_LIMIT + 10; sent++) {
      client.send({ type: 'leave', roomId: 'not-joined' })
    }

    await expect(client.next('error')).resolves.toMatchObject({ code: 'rate_limited' })
    await expect(client.waitForClose()).resolves.toMatchObject({ code: WS_POLICY_VIOLATION })
  })

  it('refuses the upgrade past the connection rate limit', async () => {
    for (let opened = 0; opened < WS_CONNECTION_LIMIT; opened++) {
      clients.push(await TestClient.open(url))
    }

    await expect(TestClient.open(url)).rejects.toThrow(/429/)
  }, 30_000)

  describe('heartbeat', () => {
    it('marks a client that answers the ping as alive again', async () => {
      await greet()
      const registry = context.app.get(ConnectionRegistry)
      const gateway = context.app.get(RoomGateway)

      gateway.pingAll()
      await settle()

      expect(registry.all().every(connection => connection.isAlive)).toBe(true)
    })

    it('terminates a client that misses two sweeps', async () => {
      const client = await greet()
      const registry = context.app.get(ConnectionRegistry)
      const gateway = context.app.get(RoomGateway)

      // Two sweeps with no pong in between is exactly what a dead peer looks like.
      gateway.pingAll()
      gateway.pingAll()
      await settle()

      expect(registry.all()).toHaveLength(0)
      expect(client.socket.readyState).toBeGreaterThan(1)
    })
  })

  it('keeps the hello handshake independent per socket', async () => {
    const first = await greet()
    const second = await TestClient.open(url)
    clients.push(second)

    second.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION })
    await second.next('hello_ok')

    expect(first.socket.readyState).toBe(1)
    expect(second.socket.readyState).toBe(1)
  })
})
