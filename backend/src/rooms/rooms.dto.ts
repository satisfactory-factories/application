import { HttpStatus } from '@nestjs/common'
import {
  CAPS,
  factoryGroupSchema,
  factorySchema,
  firstTextIssue,
  invitePasswordSchema,
  slugSchema,
  textSchema,
  truncateFactoryTab,
} from 'common'
import { z } from 'zod'
import type { FactoryTab } from 'common'

import { roomError } from './room-errors'

const roomName = textSchema('name').refine(name => name.length > 0, { error: 'A name is required.' })
const roomId = z.string().min(1).max(CAPS.string)

/** Content a room can be seeded with. Same shape a tab has in localStorage. */
const roomContent = {
  factories: z.array(factorySchema).max(CAPS.factoriesPerRoom).optional(),
  powerTarget: z.number().optional(),
  depotUploadTier: z.number().optional(),
  depotExpansionTier: z.number().optional(),
  plannerVersion: z.string().max(CAPS.string).optional(),
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

const invalid = (error: z.ZodError): never => {
  const issues = error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
  // A text rule is the user's to fix, so it gets its own code and a message worth showing.
  const textIssue = firstTextIssue(error)
  if (textIssue) {
    throw roomError('invalid_text', textIssue.message, HttpStatus.BAD_REQUEST, { textIssue, issues })
  }
  throw roomError('invalid_payload', 'Invalid request payload.', HttpStatus.BAD_REQUEST, { issues })
}

/** Rejecting parse for bodies that carry no plan content. */
export const parseBody = <T> (schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body ?? {})
  if (!result.success) invalid(result.error)
  return result.data as T
}

/**
 * The content path: drop tasks past the count cap, then reject, so a 400-factory plan,
 * a NaN or a note carrying a link never reaches the Mixed column.
 */
export const parseContentBody = <T> (schema: z.ZodType<T>, body: unknown): T => {
  if (body !== null && typeof body === 'object') truncateFactoryTab(body as FactoryTab)
  return parseBody(schema, body)
}
