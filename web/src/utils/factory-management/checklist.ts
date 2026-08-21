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
//
// Every mutation here emits `factoryUpdated`. That is the only thing that sets the cloud-sync
// dirty flag and schedules a local persist, and checklist mode is the one feature where a whole
// session can consist of nothing but ticks — so without it a build session uploads nothing, and a
// second device can then overwrite the lot. That is also why the factory is threaded through the
// item-level toggles: it makes ticking without dirtying impossible to write by accident.
import { Factory, FactoryInput, FactoryItem, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
import { getRequestsForFactory } from '@/utils/factory-management/exports'
import eventBus from '@/utils/eventBus'

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
  eventBus.emit('factoryUpdated', factory)
}

export const toggleChecklistProduct = (factory: Factory, product: FactoryItem): void => {
  product.completed = !product.completed
  if (product.completed) {
    product.checklistSyncedAmount = product.amount
  }
  eventBus.emit('factoryUpdated', factory)
}

export const toggleChecklistInput = (factory: Factory, input: FactoryInput): void => {
  input.completed = !input.completed
  if (input.completed) {
    input.checklistSyncedAmount = input.amount
  }
  eventBus.emit('factoryUpdated', factory)
}

export const toggleChecklistPowerProducer = (factory: Factory, producer: FactoryPowerProducer): void => {
  producer.completed = !producer.completed
  if (producer.completed) {
    producer.checklistSyncedAmount = producer.buildingAmount
  }
  eventBus.emit('factoryUpdated', factory)
}

export const setChecklistEnabled = (factory: Factory, enabled: boolean): void => {
  factory.checklistEnabled = enabled
  eventBus.emit('factoryUpdated', factory)
}

export const setChecklistPanelHidden = (factory: Factory, hidden: boolean): void => {
  factory.checklistPanelHidden = hidden
  eventBus.emit('factoryUpdated', factory)
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

// Does anything in this factory read as ticked-but-moved? The per-row "Desynced" chips only
// render inside an expanded factory card, so without this a collapsed factory and the sidebar
// would show a confident green N/N over rows that have all drifted.
export const hasChecklistDesync = (factory: Factory): boolean =>
  factory.products.some(isProductChecklistDesynced) ||
  factory.powerProducers.some(isPowerProducerChecklistDesynced) ||
  factory.inputs.some(isInputChecklistDesynced) ||
  getRequestsForFactory(factory).some(request =>
    isChecklistExportDesynced(factory, request.requestingFactoryId, request.part, request.amount))

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

// The one colour/state answer the three summaries share, so a collapsed factory can never claim
// something the expanded rows contradict. 'desynced' outranks 'complete' deliberately: an
// all-ticked factory whose numbers have moved is the case the player most needs telling about.
export type ChecklistSummaryState = 'desynced' | 'complete' | 'incomplete'

export const checklistSummaryState = (factory: Factory): ChecklistSummaryState => {
  if (hasChecklistDesync(factory)) return 'desynced'
  return isChecklistComplete(factory) ? 'complete' : 'incomplete'
}

// Clearing progress is the safe default when a factory is cloned. `completed` and the baselines
// are claims about buildings that physically exist in the world, and the copy's do not — while
// checklistExports keys survive on (importer, part), so an untouched tick lies dormant and springs
// back the moment that same importer buys that same part from the clone.
export const resetChecklistState = (factory: Factory): void => {
  factory.checklistExports = {}
  factory.checklistExportSyncedAmounts = {}
  factory.products.forEach(product => {
    product.completed = false
    delete product.checklistSyncedAmount
  })
  factory.powerProducers.forEach(producer => {
    producer.completed = false
    delete producer.checklistSyncedAmount
  })
  factory.inputs.forEach(input => {
    input.completed = false
    delete input.checklistSyncedAmount
  })
}

// The chip and text classes the three summaries share. Kept here beside the state rather than
// repeated as a ternary in each component, because three copies drifting apart is exactly how the
// header came to claim green over desynced rows in the first place.
export const checklistChipClass = (factory: Factory): string => {
  switch (checklistSummaryState(factory)) {
    case 'desynced': return 'status-warning'
    case 'complete': return 'green'
    default: return 'blue'
  }
}

export const checklistTextClass = (factory: Factory): string => {
  switch (checklistSummaryState(factory)) {
    case 'desynced': return 'text-status-warning'
    case 'complete': return 'text-success'
    default: return ''
  }
}
