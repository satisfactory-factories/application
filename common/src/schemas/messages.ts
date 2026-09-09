import { z } from 'zod'

import { CAPS } from '../caps'
import { truncateFactory, truncateFactoryTab, truncateRoomDiff } from '../truncate'
import type { Factory, FactoryTab } from '../types/factory'
import type { RoomDiff } from '../types/protocol'
import { factoryGroupSchema, factorySchema, factoryTabSchema } from './factory'

const str = z.string().max(CAPS.string)
const num = z.number()
const id = z.string().min(1).max(CAPS.string)
/** Opaque to the server: only its length is its business. */
const fieldKey = z.string().min(1).max(CAPS.fieldKey)

export const roomDiffSchema = z.object({
  name: z.string().max(CAPS.name).optional(),
  powerTarget: num.optional(),
  depotUploadTier: num.optional(),
  depotExpansionTier: num.optional(),
  plannerVersion: str.optional(),
  groups: z.array(factoryGroupSchema).max(CAPS.groupsPerPlan).optional(),
  factories: z.array(factorySchema).max(CAPS.factoriesPerRoom).optional(),
  removedFactoryIds: z.array(num).max(CAPS.factoriesPerRoom).optional(),
})

export const clientHelloSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: str,
  token: str.optional(),
})

export const clientJoinSchema = z.object({
  type: z.literal('join'),
  roomId: id,
  lastRevision: num.optional(),
  visitorToken: str.optional(),
})

export const clientOpSchema = z.object({
  type: z.literal('op'),
  roomId: id,
  opId: id,
  baseRevision: num,
  diff: roomDiffSchema,
  bulkRemoval: z.boolean().optional(),
})

export const clientLeaveSchema = z.object({
  type: z.literal('leave'),
  roomId: id,
})

export const clientLockSchema = z.object({
  type: z.literal('lock'),
  roomId: id,
  fieldKey,
})

export const clientUnlockSchema = z.object({
  type: z.literal('unlock'),
  roomId: id,
  fieldKey,
})

export const clientMessageSchema = z.discriminatedUnion('type', [
  clientHelloSchema,
  clientJoinSchema,
  clientOpSchema,
  clientLeaveSchema,
  clientLockSchema,
  clientUnlockSchema,
])

// ===== The boundary itself =====
// Truncate first, then reject: an over-long name must survive as a cut name, while
// a 400-factory plan or a NaN must not survive at all. Truncation mutates the input,
// which is what we want on freshly parsed wire data.

export const parseFactory = (input: unknown) =>
  factorySchema.safeParse(truncateFactory(input as Factory))

export const parseFactoryTab = (input: unknown) =>
  factoryTabSchema.safeParse(truncateFactoryTab(input as FactoryTab))

export const parseClientMessage = (input: unknown) => {
  if (input !== null && typeof input === 'object' && 'diff' in input) {
    truncateRoomDiff((input as { diff: RoomDiff }).diff)
  }
  return clientMessageSchema.safeParse(input)
}
