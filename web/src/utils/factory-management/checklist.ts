// Checklist mode: lets the player tick off products, power producers, imports and exports as they
// build them in game. Products, power producers and inputs carry their own `completed` flag
// directly (they are user-authored, persisted arrays). Exports have no equivalent home: a
// factory's exports are derived from other factories' inputs and rebuilt by the dependency
// engine, so storing state directly on a request risks it being silently dropped. Ticks for
// exports are therefore kept in factory.checklistExports, keyed by the (destination factory,
// part) pair the export chip actually represents.
//
// Desync tracking: every checked item also stamps a `checklistSyncedAmount` baseline (the export
// equivalent lives in factory.checklistExportSyncedAmounts, same keying as checklistExports). If
// the plan's own number for that item later drifts away from the baseline, the item is "desynced"
// — ticked as built, but the plan has since asked for something different. Toggling an item back
// to checked re-stamps the baseline, which is how a player acknowledges the new number. Marking
// the whole factory in sync with the game (setSyncState) re-stamps every baseline at once.
import { Factory, FactoryInput, FactoryItem, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
import { getRequestsForFactory } from '@/utils/factory-management/exports'

export const checklistExportKey = (requestingFactoryId: number | string, part: string): string =>
  `${requestingFactoryId}:${part}`

export const isChecklistExportComplete = (
  factory: Factory,
  requestingFactoryId: number | string,
  part: string
): boolean => !!factory.checklistExports[checklistExportKey(requestingFactoryId, part)]

// `amount` is the export request's current amount, stamped as the new baseline whenever this
// toggles an item ON (first tick, or acknowledging a desync by re-checking it).
export const toggleChecklistExport = (
  factory: Factory,
  requestingFactoryId: number | string,
  part: string,
  amount: number
): void => {
  const key = checklistExportKey(requestingFactoryId, part)
  const nowComplete = !factory.checklistExports[key]
  factory.checklistExports[key] = nowComplete
  if (nowComplete) {
    factory.checklistExportSyncedAmounts[key] = amount
  }
}

export const toggleChecklistProduct = (product: FactoryItem): void => {
  product.completed = !product.completed
  if (product.completed) {
    product.checklistSyncedAmount = product.amount
  }
}

export const toggleChecklistInput = (input: FactoryInput): void => {
  input.completed = !input.completed
  if (input.completed) {
    input.checklistSyncedAmount = input.amount
  }
}

export const toggleChecklistPowerProducer = (producer: FactoryPowerProducer): void => {
  producer.completed = !producer.completed
  if (producer.completed) {
    producer.checklistSyncedAmount = producer.buildingAmount
  }
}

// Desynced: ticked as built, but the number it was ticked against has since moved. An absent
// baseline (never ticked since this existed) must read as "not desynced" rather than firing on
// every old save the first time it loads.
export const isProductChecklistDesynced = (product: FactoryItem): boolean =>
  !!product.completed && product.checklistSyncedAmount !== undefined &&
  product.checklistSyncedAmount !== product.amount

export const isInputChecklistDesynced = (input: FactoryInput): boolean =>
  !!input.completed && input.checklistSyncedAmount !== undefined &&
  input.checklistSyncedAmount !== input.amount

export const isPowerProducerChecklistDesynced = (producer: FactoryPowerProducer): boolean =>
  !!producer.completed && producer.checklistSyncedAmount !== undefined &&
  producer.checklistSyncedAmount !== producer.buildingAmount

export const isChecklistExportDesynced = (
  factory: Factory,
  requestingFactoryId: number | string,
  part: string,
  amount: number
): boolean => {
  if (!isChecklistExportComplete(factory, requestingFactoryId, part)) return false
  const synced = factory.checklistExportSyncedAmounts[checklistExportKey(requestingFactoryId, part)]
  return synced !== undefined && synced !== amount
}

// Total checklist items this factory currently has: one per product, per power producer, per
// import, and per (destination, part) export pair. Recomputed rather than stored, so it always
// matches the plan.
export const countChecklistTotal = (factory: Factory): number =>
  factory.products.length + factory.powerProducers.length + factory.inputs.length +
  getRequestsForFactory(factory).length

export const countChecklistCompleted = (factory: Factory): number => {
  const products = factory.products.filter(product => product.completed).length
  const powerProducers = factory.powerProducers.filter(producer => producer.completed).length
  const inputs = factory.inputs.filter(input => input.completed).length
  const exports = getRequestsForFactory(factory)
    .filter(request => isChecklistExportComplete(factory, request.requestingFactoryId, request.part))
    .length
  return products + powerProducers + inputs + exports
}

// Fully checked, and not simply empty: a factory with nothing to check off yet should not read
// as "done". Shared by the header chip, the sidebar row and the summary panel so "complete"
// means the same thing everywhere it is shown.
export const isChecklistComplete = (factory: Factory): boolean => {
  const total = countChecklistTotal(factory)
  return total > 0 && countChecklistCompleted(factory) === total
}
