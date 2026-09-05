import { HttpException, HttpStatus } from '@nestjs/common'
import type { RoomErrorCode } from 'common'

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
