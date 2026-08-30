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
// Every mutation here goes through markFactoryEdited, which is payload AND intent. Payload
// alone would set the dirty flag and schedule the persist — checklist mode is the one feature
// where a whole session can consist of nothing but ticks, so without it a build session uploads
// nothing — but a rebase carries over only the factories the user is recorded as having touched,
// so payload alone means every tick is discarded by the first reject or reconnect. Every caller
// here is a click handler, so declaring intent is always safe. That is also why the factory is
// threaded through the item-level toggles: it makes ticking without declaring impossible to
// write by accident.
import { Factory, FactoryInput, FactoryItem, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
import { getRequestsForFactory } from '@/utils/factory-management/exports'
import { setSyncState } from '@/utils/factory-management/syncState'
import { markFactoryEdited } from '@/utils/sync-intent'

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
  // A desynced export is already ticked: a click here is the player re-confirming the new amount,
  // not un-building the infrastructure. Un-ticking it entirely needs a second, deliberate click
  // once it reads as in sync again — same rule as the other three item types below.
  if (isChecklistExportDesynced(factory, requestingFactoryId, part, amount)) {
    factory.checklistExportSyncedAmounts[key] = amount
    reconcileFactoryInSyncWithGame(factory)
    markFactoryEdited(factory)
    return
  }
  const nowComplete = !factory.checklistExports[key]
  factory.checklistExports[key] = nowComplete
  if (nowComplete) {
    factory.checklistExportSyncedAmounts[key] = amount
  }
  markFactoryEdited(factory)
}

export const toggleChecklistProduct = (factory: Factory, product: FactoryItem): void => {
  // A desynced product is already ticked: acknowledge the new amount in place rather than
  // unchecking it, which read as "unbuilding" something the player already confirmed.
  if (isProductChecklistDesynced(product)) {
    product.checklistSyncedAmount = product.amount
    reconcileFactoryInSyncWithGame(factory)
  } else {
    product.completed = !product.completed
    if (product.completed) {
      product.checklistSyncedAmount = product.amount
    }
  }
  markFactoryEdited(factory)
}

export const toggleChecklistInput = (factory: Factory, input: FactoryInput): void => {
  if (isInputChecklistDesynced(input)) {
    input.checklistSyncedAmount = input.amount
    reconcileFactoryInSyncWithGame(factory)
  } else {
    input.completed = !input.completed
    if (input.completed) {
      input.checklistSyncedAmount = input.amount
    }
  }
  markFactoryEdited(factory)
}

export const toggleChecklistPowerProducer = (factory: Factory, producer: FactoryPowerProducer): void => {
  if (isPowerProducerChecklistDesynced(producer)) {
    producer.checklistSyncedAmount = producer.buildingAmount
    reconcileFactoryInSyncWithGame(factory)
  } else {
    producer.completed = !producer.completed
    if (producer.completed) {
      producer.checklistSyncedAmount = producer.buildingAmount
    }
  }
  markFactoryEdited(factory)
}

// Re-acknowledging the last desynced item is, in effect, the player reviewing the whole plan by
// hand — the same thing the "Out of sync with game" chip's click does. Automate that one case
// rather than leaving the chip stuck on a stale warning once checklist mode has nothing left to
// flag. Scoped to factories already known out of sync (not `null`, which means the player never
// opted into game-sync tracking at all) so this never opts a factory in on their behalf.
const reconcileFactoryInSyncWithGame = (factory: Factory): void => {
  if (factory.inSync === false && !hasChecklistDesync(factory)) {
    setSyncState(factory)
  }
}

export const setChecklistEnabled = (factory: Factory, enabled: boolean): void => {
  factory.checklistEnabled = enabled
  markFactoryEdited(factory)
}

export const setChecklistPanelHidden = (factory: Factory, hidden: boolean): void => {
  factory.checklistPanelHidden = hidden
  markFactoryEdited(factory)
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
