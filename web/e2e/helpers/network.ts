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
   * Stops forwarding this client's ops to the server. Resolves once one has been
   * swallowed, so a test can say "an op is in flight" and mean it.
   */
  holdOps: () => Promise<void>
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
  let announceHeld: (() => void) | null = null
  const live = new Set<{ client: WebSocketRoute, server: WebSocketRoute }>()

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
      if (holding && String(message).includes('"type":"op"')) {
        announceHeld?.()
        announceHeld = null
        return
      }
      server.send(message)
    })
    server.onMessage(message => ws.send(message))

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
    holdOps: () => new Promise<void>(resolve => {
      holding = true
      announceHeld = resolve
    }),
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
      announceHeld = null
    },
  }
}
