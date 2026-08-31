import { z } from 'zod'

import { CAPS } from '../caps'
import { FactoryPowerChangeType, ItemType } from '../types/factory'

// The persistent-data boundary. `Room.factories` is Mixed in Mongo, so nothing but
// this file stands between the wire and the database. Unknown keys are stripped
// (zod's default for z.object) and z.number() rejects NaN and Infinity.

/** Any string with no cap of its own. */
const str = z.string().max(CAPS.string)
const num = z.number()
/** Part ids, recipe ids and factory ids used as record keys. */
const key = z.string().max(CAPS.string)
const name = z.string().max(CAPS.name)
const id = z.string().min(1).max(CAPS.string)

export const powerItemSchema = z.object({
  part: str,
  perMin: num,
  amount: num.optional(),
  mwPerItem: num.optional(),
  supplementalRatio: num.optional(),
})

export const partMetricsSchema = z.object({
  amountRequired: num,
  amountRequiredProduction: num,
  amountRequiredExports: num,
  amountRequiredPower: num,
  amountSupplied: num,
  amountSuppliedViaInput: num,
  amountSuppliedViaRaw: num,
  amountSuppliedViaProduction: num,
  amountRemaining: num,
  isRaw: z.boolean(),
  // Defaults rather than rejects: plans written before custom buildings existed are already
  // in browsers, and refusing one costs an op per factory.
  amountRequiredBuildings: num.default(0),
  // Derived every calculation, so absent on anything saved before they existed. Optional
  // rather than defaulted: a default would add bytes the sender's own copy does not have.
  isEndProduct: z.boolean().optional(),
  isSinkable: z.boolean().optional(),
  amountRequiredSink: num.optional(),
  amountRemainingPreSink: num.optional(),
  satisfied: z.boolean(),
  exportable: z.boolean(),
})

export const buildingRequirementSchema = z.object({
  name: str,
  amount: num,
  powerConsumed: num.optional(),
  powerProduced: num.optional(),
})

/** A blank "Add Product" row has no item and so no building to require yet. */
export const emptyBuildingRequirement = { name: '', amount: 0 }

/**
 * The product's own requirement, defaulted for the same reason `power` is: the planner
 * writes `{}` into a row the user has not chosen an item for, that row is real stored
 * content, and refusing it costs every op the client sends afterwards.
 */
export const productBuildingRequirementSchema = z.object({
  name: str.default(''),
  amount: num.default(0),
  powerConsumed: num.optional(),
  powerProduced: num.optional(),
}).default(emptyBuildingRequirement)

export const byProductItemSchema = z.object({
  id: str,
  amount: num,
  byProductOf: str,
})

export const buildingMaterialCostSchema = z.object({
  amount: num,
  buildings: z.record(key, num),
})

export const factoryCustomBuildingSchema = z.object({
  id: str,
  building: str,
  amount: num,
  ingredients: z.array(z.object({ part: str, perMin: num })),
  powerConsumed: num,
  displayOrder: num,
})

export const factoryCustomBuildingSyncStateSchema = z.object({
  building: str,
  amount: num,
  ingredientAmount: num,
})

export const nodePuritySchema = z.enum(['impure', 'normal', 'pure'])

/**
 * Satellite extractors per purity on a resource well. The three keys default rather than
 * reject: the well's output is their sum, and losing the whole factory over one absent key
 * would cost more than reading the missing purity as no satellites.
 */
export const wellSatellitesSchema = z.object({
  impure: num.default(0),
  normal: num.default(0),
  pure: num.default(0),
})

export const buildingGroupSchema = z.object({
  id: num,
  buildingCount: num,
  overclockPercent: num,
  clockSetByUser: z.boolean().optional(),
  parts: z.record(key, num),
  powerUsage: num,
  powerUsageMin: num.optional(),
  powerUsageMax: num.optional(),
  powerProduced: num,
  powerProducedMin: num.optional(),
  powerProducedMax: num.optional(),
  supplyMatrixes: z.boolean().optional(),
  somersloops: num.optional(),
  // Extraction and resource-well groups only; absent on every other group type.
  extractorBuilding: str.optional(),
  purity: nodePuritySchema.optional(),
  satellites: wellSatellitesSchema.optional(),
  type: z.enum(ItemType),
})

/**
 * Checklist mode's two per-row fields, on products, imports and power producers alike:
 * whether the player has ticked it as built, and the amount it was ticked against.
 * Optional everywhere — absent means never ticked, which must not read as desynced.
 */
const checklistRowFields = {
  completed: z.boolean().optional(),
  checklistSyncedAmount: num.optional(),
}

export const factoryItemSchema = z.object({
  id: str,
  recipe: str,
  amount: num,
  displayOrder: num,
  requirements: z.record(key, z.object({ amount: num })),
  buildingRequirements: productBuildingRequirementSchema,
  byProducts: z.array(byProductItemSchema).optional(),
  buildingGroups: z.array(buildingGroupSchema),
  buildingGroupsTrayOpen: z.boolean(),
  buildingGroupsHaveProblem: z.boolean(),
  buildingGroupItemSync: z.boolean(),
  ...checklistRowFields,
})

export const factoryDependencyRequestSchema = z.object({
  requestingFactoryId: num,
  part: str,
  amount: num,
})

export const factoryDependencyMetricsSchema = z.object({
  part: str,
  request: num,
  supply: num,
  isRequestSatisfied: z.boolean(),
  difference: num,
})

export const factoryDependencySchema = z.object({
  requests: z.record(key, z.array(factoryDependencyRequestSchema)),
  metrics: z.record(key, factoryDependencyMetricsSchema),
})

export const exportCalculatorTransportGroupSchema = z.object({
  id: num,
  mark: num,
  amount: num,
})

export const exportCalculatorFactorySettingsSchema = z.object({
  trainTime: num,
  droneTime: num,
  truckTime: num,
  tractorTime: num,
  beltGroups: z.array(exportCalculatorTransportGroupSchema).optional(),
  pipeGroups: z.array(exportCalculatorTransportGroupSchema).optional(),
})

export const exportCalculatorSettingsSchema = z.object({
  selected: str.nullable(),
  factorySettings: z.record(key, exportCalculatorFactorySettingsSchema),
})

export const worldRawResourceSchema = z.object({
  id: str,
  name: str,
  amount: num,
})

export const factoryInputSchema = z.object({
  factoryId: num.nullable(),
  outputPart: str.nullable(),
  amount: num,
  ...checklistRowFields,
})

export const factorySyncStateSchema = z.object({
  amount: num,
  recipe: str,
})

export const factoryPowerSyncStateSchema = z.object({
  buildingAmount: num,
  powerAmount: num,
  recipe: str,
  ingredientAmount: num,
  // The building this producer was when it was marked in sync. Absent must not read as a
  // change, so it stays optional rather than defaulting to an empty string.
  building: str.optional(),
})

export const factoryTaskSchema = z.object({
  title: z.string().max(CAPS.taskTitle),
  completed: z.boolean(),
})

export const factoryPowerProducerSchema = z.object({
  id: str,
  building: str,
  buildingAmount: num,
  buildingCount: num,
  ingredients: z.array(powerItemSchema),
  fuelAmount: num,
  byproduct: z.object({ part: str, amount: num }).nullable(),
  powerAmount: num,
  powerProduced: num,
  recipe: str,
  displayOrder: num,
  updated: z.enum(FactoryPowerChangeType).nullable(),
  buildingGroups: z.array(buildingGroupSchema),
  buildingGroupsTrayOpen: z.boolean(),
  buildingGroupsHaveProblem: z.boolean(),
  buildingGroupItemSync: z.boolean(),
  ...checklistRowFields,
})

// The three totals default rather than reject: a factory the user added but never
// calculated persists `power` as `{}`, and plans in that shape are already in the wild.
// Refusing them cost an op per added factory and made adoption fail outright.
export const factoryPowerSchema = z.object({
  consumed: num.default(0),
  consumedMin: num.optional(),
  consumedMax: num.optional(),
  produced: num.default(0),
  producedMin: num.optional(),
  producedMax: num.optional(),
  boostPercent: num.optional(),
  boostMw: num.optional(),
  boostFueledBuildings: num.optional(),
  boostUnfueledBuildings: num.optional(),
  difference: num.default(0),
})

/** The zeroed shape an uncalculated factory gets, here and in `newFactory()`. */
export const emptyFactoryPower = () => ({ consumed: 0, produced: 0, difference: 0 })

export const factoryGroupSchema = z.object({
  id,
  name,
  color: z.string().max(CAPS.groupColor),
  order: num,
})

/**
 * Sinks and depot uploaders placed on one part's surplus. Both counts default so a record
 * that only ever named one of them still parses; the client floors negatives and non-finite
 * values on the way in (`cleanDisposalCount`), and `num` refuses NaN here regardless.
 */
export const factoryPartDisposalSchema = z.object({
  sinks: num.default(0),
  depots: num.default(0),
})

export const factorySchema = z.object({
  id: num,
  name,
  inputs: z.array(factoryInputSchema),
  previousInputs: z.array(factoryInputSchema),
  products: z.array(factoryItemSchema),
  byProducts: z.array(byProductItemSchema),
  powerProducers: z.array(factoryPowerProducerSchema),
  // Everything below carrying a default arrived with the merge of main and is defaulted for
  // the same reason `power` is: plans without it are already stored, on the server and in
  // browsers alike, and a rejection there costs an op per factory.
  customBuildings: z.array(factoryCustomBuildingSchema).default(() => []),
  parts: z.record(key, partMetricsSchema),
  buildingRequirements: z.record(key, buildingRequirementSchema),
  buildingMaterialCosts: z.record(key, buildingMaterialCostSchema).default(() => ({})),
  requirementsSatisfied: z.boolean(),
  exportCalculator: z.record(key, exportCalculatorSettingsSchema),
  // Optional, with no default: the map is sticky and a plan that never placed a sink or an
  // uploader has no key at all, which is a different thing from having placed none.
  partDisposal: z.record(key, factoryPartDisposalSchema).optional(),
  dependencies: factoryDependencySchema,
  rawResources: z.record(key, worldRawResourceSchema),
  power: factoryPowerSchema.default(emptyFactoryPower),
  usingRawResourcesOnly: z.boolean(),
  hidden: z.boolean(),
  hasProblem: z.boolean(),
  inSync: z.boolean().nullable(),
  syncState: z.record(key, factorySyncStateSchema),
  syncStatePower: z.record(key, factoryPowerSyncStateSchema),
  syncStateCustomBuildings: z.record(key, factoryCustomBuildingSyncStateSchema).default(() => ({})),
  displayOrder: num,
  tasks: z.array(factoryTaskSchema).max(CAPS.tasks),
  notes: z.string().max(CAPS.notes),
  checklistEnabled: z.boolean().default(false),
  checklistPanelHidden: z.boolean().default(false),
  checklistExports: z.record(key, z.boolean()).default(() => ({})),
  checklistExportSyncedAmounts: z.record(key, num).default(() => ({})),
  icon: str.optional(),
  group: factoryGroupSchema.optional(),
  dataVersion: str,
})

/**
 * Tab-owned settings beyond the name, power target and group registry. All optional, and
 * absent carries meaning in every case — the depot tiers read as fully researched, and an
 * absent `plannerVersion` means the plan has not been answered for. Unclamped on purpose:
 * the planner clamps a tier on read, and rejecting a tab over a `2.5` here would cost the
 * whole plan.
 */
export const factoryTabSchema = z.object({
  id,
  name,
  factories: z.array(factorySchema).max(CAPS.factoriesPerRoom),
  powerTarget: num.optional(),
  depotUploadTier: num.optional(),
  depotExpansionTier: num.optional(),
  plannerVersion: str.optional(),
  groups: z.array(factoryGroupSchema).optional(),
})

/** Reject unless it matches `^[a-z0-9-]{1,100}$` once lowercased. */
export const slugSchema = z.string()
  .max(CAPS.string)
  .transform(value => value.toLowerCase())
  .refine(value => CAPS.slugPattern.test(value), { error: 'Invalid slug' })

export const invitePasswordSchema = z.string()
  .min(CAPS.passwordMin)
  .max(CAPS.passwordMax)
