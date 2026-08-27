import { HttpStatus } from '@nestjs/common'
import { CAPS, factoryGroupSchema, factorySchema, invitePasswordSchema, slugSchema, truncateFactoryTab } from 'common'
import { z } from 'zod'
import type { Factory, FactoryGroup, FactoryTab } from 'common'

import { roomError } from './room-errors'

const roomName = z.string().min(1).max(CAPS.name)
const roomId = z.string().min(1).max(CAPS.string)

/** Content a room can be seeded with. Same shape a tab has in localStorage. */
const roomContent = {
  factories: z.array(factorySchema).max(CAPS.factoriesPerRoom).optional(),
  powerTarget: z.number().optional(),
  groups: z.array(factoryGroupSchema).optional(),
}

export const createRoomSchema = z.object({ roomId: roomId.optional(), name: roomName, ...roomContent })
export const adoptRoomSchema = z.object({ roomId, name: roomName, ...roomContent })
export const renameRoomSchema = z.object({ name: roomName })
export const reorderSchema = z.object({ roomIds: z.array(roomId).max(CAPS.membershipsPerUser) })
export const shareRoomSchema = z.object({ slug: slugSchema.optional() })
export const setPasswordSchema = z.object({ password: invitePasswordSchema })
export const authRoomSchema = z.object({ password: z.string().max(CAPS.string) })
export const joinRoomSchema = z.object({ visitorToken: z.string().max(CAPS.string).optional() })
export const autoImportSchema = z.object({ localTabCount: z.number().int().min(0) })

export interface RoomContentInput {
  factories?: Factory[]
  powerTarget?: number
  groups?: FactoryGroup[]
}

const invalid = (issues: z.ZodIssue[]): never => {
  throw roomError('invalid_payload', 'Invalid request payload.', HttpStatus.BAD_REQUEST, {
    issues: issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  })
}

/** Rejecting parse for bodies that carry no plan content. */
export const parseBody = <T> (schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body ?? {})
  if (!result.success) invalid(result.error.issues)
  return result.data as T
}

/**
 * The content path: truncate first so an over-long name survives as a cut name,
 * then reject, so a 400-factory plan or a NaN never reaches the Mixed column.
 */
export const parseContentBody = <T> (schema: z.ZodType<T>, body: unknown): T => {
  if (body !== null && typeof body === 'object') truncateFactoryTab(body as FactoryTab)
  return parseBody(schema, body)
}
