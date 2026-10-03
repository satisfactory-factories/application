/** How long a password exchange buys an anonymous visitor. */
export const VISITOR_TOKEN_TTL = '7d'

/**
 * Handed out by `POST /rooms/:roomId/auth`. `passwordVersion` is the revocation
 * lever: rotating the room password bumps it and every outstanding token dies,
 * without anything having to be stored server-side.
 */
export interface VisitorTokenPayload {
  roomId: string
  passwordVersion: number
  role: 'visitor'
  iat?: number
  exp?: number
}

export const isVisitorTokenPayload = (value: unknown): value is VisitorTokenPayload => {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Partial<VisitorTokenPayload>
  return payload.role === 'visitor' &&
    typeof payload.roomId === 'string' &&
    typeof payload.passwordVersion === 'number'
}
