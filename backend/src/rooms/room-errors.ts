import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Every failure the rooms API can return. The client switches on `code`, so
 * these strings are wire contract, not log text.
 */
export type RoomErrorCode =
  | 'room_not_found'
  | 'room_id_taken'
  | 'forbidden'
  | 'not_shared'
  | 'slug_taken'
  | 'invalid_slug'
  | 'invalid_password'
  | 'password_required'
  | 'no_password_set'
  | 'owner_cannot_leave'
  | 'too_many_rooms'
  | 'too_many_memberships'
  | 'invalid_payload'
  | 'revision_mismatch'

export interface RoomErrorBody {
  code: RoomErrorCode
  message: string
}

export const roomError = (
  code: RoomErrorCode,
  message: string,
  status: HttpStatus,
  extra: Record<string, unknown> = {},
): HttpException => new HttpException({ code, message, ...extra }, status)

export const notFound = (): HttpException =>
  roomError('room_not_found', 'Room not found.', HttpStatus.NOT_FOUND)

export const forbidden = (message = 'You do not have access to this room.'): HttpException =>
  roomError('forbidden', message, HttpStatus.FORBIDDEN)

export const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
