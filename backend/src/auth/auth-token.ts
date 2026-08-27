import type { Request } from 'express'

/** The JWT payload, unchanged from the Express API: `{ id, username }`, HS256, 30d. */
export interface AuthTokenPayload {
  id: string
  username: string
  iat?: number
  exp?: number
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload
}
