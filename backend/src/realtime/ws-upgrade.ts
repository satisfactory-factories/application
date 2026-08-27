import type { IncomingMessage } from 'node:http'

import type WebSocket from 'ws'

import { WEB_ORIGINS } from '../config/cors'
import { wsConnectionLimiter } from './ws-throttle'

/**
 * Anti-CSRF hygiene, not authorization. A missing Origin is a non-browser client,
 * which cannot be CSRF'd and could forge the header anyway; the token in `hello`
 * is what actually authorises anything.
 */
export const isAllowedWsOrigin = (origin: string | undefined): boolean =>
  origin === undefined || origin === '' || WEB_ORIGINS.includes(origin)

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
  if (!wsConnectionLimiter.allow(wsClientIp(info.req))) {
    done(false, 429, 'Too many connection attempts')
    return
  }
  done(true)
}
