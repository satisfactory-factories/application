import type { BrowserContext, Page, WebSocketRoute } from '@playwright/test'

import { API_URL } from '../config'

/** Going away: a close the client is expected to retry through, not give up on. */
const GOING_AWAY = 1001

export interface ApiTraffic {
  /** Every API URL this context has asked for since the last reset. */
  urls: () => string[]
  reset: () => void
}

/**
 * Counts REST traffic to the backend. Offline mode's promise is total silence,
 * and the only honest way to check that is to watch the wire.
 */
export const watchApiRequests = (context: BrowserContext): ApiTraffic => {
  let seen: string[] = []

  context.on('request', request => {
    if (request.url().startsWith(API_URL)) seen.push(request.url())
  })

  return {
    urls: () => [...seen],
    reset: () => { seen = [] },
  }
}

export interface WsGate {
  /** How many times the client has opened a socket, successful or not. */
  connections: () => number
  /**
   * Every frame this client has put on the wire, parsed. The only honest way to
   * assert that something was never sent, as opposed to never having an effect.
   */
  sent: () => Record<string, unknown>[]
  /** Every frame the server has sent this client, parsed. Its side of the conversation. */
  received: () => Record<string, unknown>[]
  /**
   * Stops forwarding this client's ops to the server. Resolves once one has been
   * swallowed, so a test can say "an op is in flight" and mean it.
   */
  holdOps: () => Promise<void>
  /**
   * Queues this client's ops instead of forwarding them, and resolves with the
   * first one queued. Unlike `holdOps` nothing is thrown away, so `releaseOps`
   * puts the client back where it would have been.
   *
   * This is what makes a concurrent edit concurrent: two clients each holding an
   * op built against the same revision, neither yet seen by the server.
   */
  stallOps: () => Promise<Record<string, unknown>>
  /** Forwards everything `stallOps` queued, in order, and stops queueing. */
  releaseOps: () => void
  /** Drops the live socket and refuses every reconnect until `restore`. */
  kill: () => Promise<void>
  restore: () => void
}

/**
 * Sits between one client and the gateway. Everything is forwarded verbatim by
 * default; the controls exist so a disconnection can be caused at an exactly
 * known moment rather than waited for.
 */
export const installWsGate = async (page: Page): Promise<WsGate> => {
  let connections = 0
  let killed = false
  let holding = false
  let stalling = false
  let announceHeld: (() => void) | null = null
  let announceStalled: ((op: Record<string, unknown>) => void) | null = null
  const sent: Record<string, unknown>[] = []
  const received: Record<string, unknown>[] = []
  /** Frames `stallOps` took off the wire, with the socket that has to send them on. */
  const queued: { server: WebSocketRoute, message: string | Buffer }[] = []
  const live = new Set<{ client: WebSocketRoute, server: WebSocketRoute }>()

  const isOp = (message: string | Buffer): boolean => String(message).includes('"type":"op"')

  await page.routeWebSocket(/\/ws$/, ws => {
    connections++
    if (killed) {
      ws.close({ code: GOING_AWAY, reason: 'gate closed' })
      return
    }

    const server = ws.connectToServer()
    const pair = { client: ws, server }
    live.add(pair)

    ws.onMessage(message => {
      // Recorded before the hold, so a swallowed frame still counts as one the client
      // chose to put on the wire — which is the thing under test.
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(String(message)) as Record<string, unknown>
        sent.push(parsed)
      } catch {
        // A frame this harness cannot read is not one any assertion is about.
      }
      if (holding && isOp(message)) {
        announceHeld?.()
        announceHeld = null
        return
      }
      if (stalling && isOp(message)) {
        queued.push({ server, message })
        if (parsed) {
          announceStalled?.(parsed)
          announceStalled = null
        }
        return
      }
      server.send(message)
    })
    server.onMessage(message => {
      try {
        received.push(JSON.parse(String(message)) as Record<string, unknown>)
      } catch {
        // Same as above: unreadable frames are nothing any assertion is about.
      }
      ws.send(message)
    })

    ws.onClose((code, reason) => {
      live.delete(pair)
      server.close({ code, reason })
    })
    server.onClose((code, reason) => {
      live.delete(pair)
      ws.close({ code, reason })
    })
  })

  return {
    connections: () => connections,
    sent: () => [...sent],
    received: () => [...received],
    holdOps: () => new Promise<void>(resolve => {
      holding = true
      announceHeld = resolve
    }),
    stallOps: () => new Promise<Record<string, unknown>>(resolve => {
      stalling = true
      announceStalled = resolve
    }),
    releaseOps: () => {
      stalling = false
      announceStalled = null
      for (const { server, message } of queued.splice(0)) server.send(message)
    },
    kill: async () => {
      killed = true
      for (const pair of [...live]) {
        pair.server.close({ code: GOING_AWAY, reason: 'gate closed' })
        pair.client.close({ code: GOING_AWAY, reason: 'gate closed' })
      }
      live.clear()
    },
    restore: () => {
      killed = false
      holding = false
      stalling = false
      announceHeld = null
      announceStalled = null
      queued.length = 0
    },
  }
}
