import type { AuthTokenClaims } from 'common'
import type { Request } from 'express'

/** The JWT payload, unchanged from the Express API: `{ id, username }`, HS256, 30d. */
export type AuthTokenPayload = AuthTokenClaims

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload
}

/**
 * Room visitor tokens are signed with the same secret, so a valid signature says nothing
 * about what kind of token it is: the shape is the check. Without it a visitor token
 * passes as an account whose `id` and `username` are both undefined.
 */
export const isAccountTokenPayload = (payload: unknown): payload is AuthTokenPayload => {
  if (typeof payload !== 'object' || payload === null) return false
  const candidate = payload as { id?: unknown, username?: unknown, role?: unknown }
  return typeof candidate.id === 'string' &&
    typeof candidate.username === 'string' &&
    candidate.role !== 'visitor'
}
