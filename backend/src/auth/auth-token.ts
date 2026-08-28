import type { AuthTokenClaims } from 'common'
import type { Request } from 'express'

/** The JWT payload, unchanged from the Express API: `{ id, username }`, HS256, 30d. */
export type AuthTokenPayload = AuthTokenClaims

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload
}
