import type { IncomingMessage } from 'node:http'

import type WebSocket from 'ws'

import { isAllowedWsOrigin } from '../config/cors'
import { wsConcurrencyLimiter, wsConnectionLimiter } from './ws-throttle'

export { isAllowedWsOrigin }

/** Mirrors express's `trust proxy = 1`: one trusted hop, so the last entry wins. */
export const wsClientIp = (request: IncomingMessage): string => {
  const forwarded = request.headers['x-forwarded-for']
  const chain = Array.isArray(forwarded) ? forwarded.join(',') : forwarded
  const nearest = chain?.split(',').map(part => part.trim()).filter(Boolean).pop()
  return nearest ?? request.socket.remoteAddress ?? 'unknown'
}

export const verifyWsClient: WebSocket.VerifyClientCallbackAsync = (info, done) => {
  if (!isAllowedWsOrigin(info.origin as string | undefined)) {
    done(false, 403, 'Origin not allowed')
    return
  }
  const ip = wsClientIp(info.req)
  if (!wsConnectionLimiter.allow(ip)) {
    done(false, 429, 'Too many connection attempts')
    return
  }
  if (!wsConcurrencyLimiter.acquire(ip)) {
    done(false, 503, 'Too many open connections')
    return
  }

  // Released off the TCP socket rather than the gateway, so a slot is given back even
  // when the upgrade never completes and no connection is ever handed over.
  info.req.socket.once('close', () => { wsConcurrencyLimiter.release(ip) })
  done(true)
}
