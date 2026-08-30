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
  satisfied: z.boolean(),
  exportable: z.boolean(),
})

export const buildingRequirementSchema = z.object({
  name: str,
  amount: num,
  powerConsumed: num.optional(),
  powerProduced: num.optional(),
})

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
  type: z.enum(ItemType),
})

export const factoryItemSchema = z.object({
  id: str,
  recipe: str,
  amount: num,
  displayOrder: num,
  requirements: z.record(key, z.object({ amount: num })),
  buildingRequirements: buildingRequirementSchema,
  byProducts: z.array(byProductItemSchema).optional(),
  buildingGroups: z.array(buildingGroupSchema),
  buildingGroupsTrayOpen: z.boolean(),
  buildingGroupsHaveProblem: z.boolean(),
  buildingGroupItemSync: z.boolean(),
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

export const factoryTabSchema = z.object({
  id,
  name,
  factories: z.array(factorySchema).max(CAPS.factoriesPerRoom),
  powerTarget: num.optional(),
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
