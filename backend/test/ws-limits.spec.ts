import { CAPS, PROTOCOL_VERSION } from 'common'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeFactory } from 'common/testing'

import { BULK_RESTORE_MAX_BYTES } from '../src/realtime/room-op.service'
import { ConnectionRegistry } from '../src/realtime/connection-registry'
import { RoomGateway } from '../src/realtime/room.gateway'
import { TestClient, closeAll } from './utils/ws-client'
import { TestContext, createTestApp, destroyTestApp } from './utils/test-app'
import { buildIndexes, resetRooms } from './utils/rooms'
import { wsConcurrencyLimiter, wsConnectionLimiter } from '../src/realtime/ws-throttle'
import {
  WS_CONNECTION_LIMIT,
  WS_MAX_PAYLOAD_BYTES,
  WS_MAX_SOCKETS_PER_IP,
  WS_MESSAGE_LIMIT,
  WS_POLICY_VIOLATION,
} from '../src/realtime/realtime.constants'

/** The biggest factory a real 36-factory plan holds, measured off it. */
const LARGEST_REAL_FACTORY_BYTES = 15_314

/** A full room of those: the largest plan the caps table allows anyone to hold. */
const roomCapPlan = () => {
  const padding = 'x'.repeat(LARGEST_REAL_FACTORY_BYTES - JSON.stringify(makeFactory()).length)
  return Array.from({ length: CAPS.factoriesPerRoom }, (_unused, index) =>
    ({ ...makeFactory({ id: index + 1, name: `Factory ${index}` }), notes: padding }))
}

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
    wsConcurrencyLimiter.reset()
    await resetRooms(context.app)
  })

  afterEach(() => {
    closeAll(clients)
    wsConnectionLimiter.reset()
    wsConcurrencyLimiter.reset()
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

  /**
   * The frame ceiling has to be derived from the largest thing a client legitimately
   * sends, or it is just a number: 25MB let one socket hand the process three times the
   * biggest plan the room cap allows.
   */
  it('takes a room-cap op built from the biggest factories a real plan holds', () => {
    const frame = JSON.stringify({
      type: 'op', roomId: 'a-room', opId: 'an-op', baseRevision: 0, diff: { factories: roomCapPlan() },
    })

    expect(frame.length).toBeLessThan(WS_MAX_PAYLOAD_BYTES)
    // Headroom, not an order of magnitude: twice the largest legitimate frame.
    expect(WS_MAX_PAYLOAD_BYTES).toBeLessThan(frame.length * 3)
  })

  /**
   * The stash duplicates the plan inside the one room document, so the budget has to clear
   * the biggest plan the cap allows or an ordinary bulk clear silently loses its undo.
   */
  it('leaves room to stash a room-cap plan as a bulk restore point', () => {
    expect(JSON.stringify(roomCapPlan()).length).toBeLessThan(BULK_RESTORE_MAX_BYTES)
  })

  it('refuses a socket past the per-address concurrent ceiling', async () => {
    for (let opened = 0; opened < WS_MAX_SOCKETS_PER_IP; opened++) {
      clients.push(await TestClient.open(url))
    }
    // The rate window rolling over must not hand back a slot: these are still open.
    wsConnectionLimiter.reset()

    await expect(TestClient.open(url)).rejects.toThrow(/503/)
  }, 30_000)

  it('gives a slot back when a socket closes', async () => {
    const client = await TestClient.open(url)
    const held = wsConcurrencyLimiter.size()
    client.close()

    await expect.poll(() => wsConcurrencyLimiter.size()).toBe(held - 1)
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
