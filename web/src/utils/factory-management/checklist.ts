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
// — ticked as built, but the plan has since asked for something different. Because the baseline is
// kept, the flag can say what actually changed rather than only that something did: the pair of
// numbers is the primitive (ChecklistDesync), and "is it desynced" derives from it. Toggling an
// item back to checked re-stamps the baseline, which is how a player acknowledges the new number;
// acknowledgeChecklistDesyncs does the same for every moved row at once. Marking the whole factory
// in sync with the game (setSyncState) re-stamps every baseline, moved or not.
//
// Every mutation here emits `factoryUpdated`. That is the only thing that sets the cloud-sync
// dirty flag and schedules a local persist, and checklist mode is the one feature where a whole
// session can consist of nothing but ticks — so without it a build session uploads nothing, and a
// second device can then overwrite the lot. That is also why the factory is threaded through the
// item-level toggles: it makes ticking without dirtying impossible to write by accident.
import { Factory, FactoryInput, FactoryItem, FactoryPowerProducer } from '@/interfaces/planner/FactoryInterface'
import { getRequestsForFactory } from '@/utils/factory-management/exports'
import { setSyncState } from '@/utils/factory-management/syncState'
import { formatNumber } from '@/utils/numberFormatter'
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
  // A desynced export is already ticked: a click here is the player re-confirming the new amount,
  // not un-building the infrastructure. Un-ticking it entirely needs a second, deliberate click
  // once it reads as in sync again — same rule as the other three item types below.
  if (isChecklistExportDesynced(factory, requestingFactoryId, part, amount)) {
    factory.checklistExportSyncedAmounts[key] = amount
    reconcileFactoryInSyncWithGame(factory)
    eventBus.emit('factoryUpdated', factory)
    return
  }
  const nowComplete = !factory.checklistExports[key]
  factory.checklistExports[key] = nowComplete
  if (nowComplete) {
    factory.checklistExportSyncedAmounts[key] = amount
  }
  eventBus.emit('factoryUpdated', factory)
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
  eventBus.emit('factoryUpdated', factory)
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
  eventBus.emit('factoryUpdated', factory)
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
  eventBus.emit('factoryUpdated', factory)
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
  eventBus.emit('factoryUpdated', factory)
}

export const setChecklistPanelHidden = (factory: Factory, hidden: boolean): void => {
  factory.checklistPanelHidden = hidden
  eventBus.emit('factoryUpdated', factory)
}

// Desynced: ticked as built, but the number it was ticked against has since moved. What the
// player needs is not that something moved but WHAT moved and by how much, so the primitive here
// is the pair of numbers, and "is it desynced" is derived from it. An absent baseline (never
// ticked since this existed) must read as "not desynced" rather than firing on every old save the
// first time it loads.
//
// Products, imports and exports are rates; a power producer's baseline is a building count. The
// unit rides along so a chip 200 lines away cannot mislabel 40 generators as 40/min.
export type ChecklistDesyncUnit = 'perMin' | 'buildings'

export interface ChecklistDesync {
  // The number this item was ticked against.
  from: number
  // What the plan asks for now.
  to: number
  unit: ChecklistDesyncUnit
}

const desyncBetween = (
  completed: boolean,
  baseline: number | undefined,
  current: number,
  unit: ChecklistDesyncUnit
): ChecklistDesync | null =>
  completed && baseline !== undefined && baseline !== current
    ? { from: baseline, to: current, unit }
    : null

export const productChecklistDesync = (product: FactoryItem): ChecklistDesync | null =>
  desyncBetween(!!product.completed, product.checklistSyncedAmount, product.amount, 'perMin')

export const inputChecklistDesync = (input: FactoryInput): ChecklistDesync | null =>
  desyncBetween(!!input.completed, input.checklistSyncedAmount, input.amount, 'perMin')

export const powerProducerChecklistDesync = (producer: FactoryPowerProducer): ChecklistDesync | null =>
  desyncBetween(
    !!producer.completed,
    producer.checklistSyncedAmount,
    producer.buildingAmount,
    'buildings'
  )

export const checklistExportDesync = (
  factory: Factory,
  requestingFactoryId: number | string,
  part: string,
  amount: number
): ChecklistDesync | null =>
  desyncBetween(
    isChecklistExportComplete(factory, requestingFactoryId, part),
    factory.checklistExportSyncedAmounts[checklistExportKey(requestingFactoryId, part)],
    amount,
    'perMin'
  )

export const isProductChecklistDesynced = (product: FactoryItem): boolean =>
  productChecklistDesync(product) !== null

export const isInputChecklistDesynced = (input: FactoryInput): boolean =>
  inputChecklistDesync(input) !== null

export const isPowerProducerChecklistDesynced = (producer: FactoryPowerProducer): boolean =>
  powerProducerChecklistDesync(producer) !== null

export const isChecklistExportDesynced = (
  factory: Factory,
  requestingFactoryId: number | string,
  part: string,
  amount: number
): boolean => checklistExportDesync(factory, requestingFactoryId, part, amount) !== null

const desyncValue = (value: number, unit: ChecklistDesyncUnit): string =>
  unit === 'buildings'
    ? `${formatNumber(value)} ${value === 1 ? 'building' : 'buildings'}`
    : `${formatNumber(value)}/min`

// "560 → 720/min". Short enough to sit on the chip beside the row it belongs to, and specific
// enough that the player can tell at a glance whether the change is worth walking to the factory
// for. The unit is stated once, on the number that is now true.
export const checklistDesyncChange = (desync: ChecklistDesync): string =>
  `${formatNumber(desync.from)} → ${desyncValue(desync.to, desync.unit)}`

// The long form, for tooltips: what changed, and the two things the player can do about it. Both
// are legitimate — the plan may have moved because they changed their mind, in which case the
// build is what is wrong, not the tick.
export const checklistDesyncReason = (desync: ChecklistDesync): string =>
  `Ticked as built at ${desyncValue(desync.from, desync.unit)}, but the plan now says ` +
  `${desyncValue(desync.to, desync.unit)}. Build the difference and click to confirm, or change ` +
  'the plan back.'

// The checklist ticks scattered through the product, import, power and satisfaction rows have no
// room for a chip beside them, so their native `title` carries the same two numbers the chip in
// the checklist panel would have shown.
export const checklistTickTitle = (desync: ChecklistDesync | null, fallback: string): string =>
  desync ? checklistDesyncReason(desync) : fallback

// One desynced row, named well enough for a summary to list it without re-deriving which of the
// four lists it came from. Part / building / factory ids stay raw: turning them into display
// names needs the game data, which is a component's job rather than this module's.
export type ChecklistDesyncKind = 'product' | 'power' | 'import' | 'export'

export interface ChecklistDesyncEntry {
  kind: ChecklistDesyncKind
  desync: ChecklistDesync
  part?: string
  building?: string
  // Imports: the factory supplying it. Exports: the factory asking for it.
  factoryId?: number | string | null
}

// Every desynced row in the factory, in the order the checklist panel lists them. Separate from
// hasChecklistDesync, which stays a short-circuiting `.some()` because it runs for every factory
// card and sidebar row on every recalculation, whether or not anything is desynced at all.
export const listChecklistDesyncs = (factory: Factory): ChecklistDesyncEntry[] => {
  const entries: ChecklistDesyncEntry[] = []

  factory.products.forEach(product => {
    const desync = productChecklistDesync(product)
    if (desync) entries.push({ kind: 'product', desync, part: product.id })
  })
  factory.powerProducers.forEach(producer => {
    const desync = powerProducerChecklistDesync(producer)
    if (desync) entries.push({ kind: 'power', desync, building: producer.building })
  })
  factory.inputs.forEach(input => {
    const desync = inputChecklistDesync(input)
    if (desync) {
      entries.push({ kind: 'import', desync, part: input.outputPart ?? undefined, factoryId: input.factoryId })
    }
  })
  getRequestsForFactory(factory).forEach(request => {
    const desync = checklistExportDesync(factory, request.requestingFactoryId, request.part, request.amount)
    if (desync) {
      entries.push({ kind: 'export', desync, part: request.part, factoryId: request.requestingFactoryId })
    }
  })

  return entries
}

export const countChecklistDesynced = (factory: Factory): number => listChecklistDesyncs(factory).length

// Acknowledge every desynced row at once: the same "yes, I have built that change" a re-tick
// makes, applied to all of them. Only rows that have actually moved are re-stamped, so this can
// never quietly baseline something the player has not ticked. Deliberately lighter than
// setSyncState, which also claims the whole factory matches the game.
export const acknowledgeChecklistDesyncs = (factory: Factory): void => {
  factory.products.forEach(product => {
    if (productChecklistDesync(product)) product.checklistSyncedAmount = product.amount
  })
  factory.powerProducers.forEach(producer => {
    if (powerProducerChecklistDesync(producer)) producer.checklistSyncedAmount = producer.buildingAmount
  })
  factory.inputs.forEach(input => {
    if (inputChecklistDesync(input)) input.checklistSyncedAmount = input.amount
  })
  getRequestsForFactory(factory).forEach(request => {
    if (checklistExportDesync(factory, request.requestingFactoryId, request.part, request.amount)) {
      factory.checklistExportSyncedAmounts[checklistExportKey(request.requestingFactoryId, request.part)] =
        request.amount
    }
  })

  reconcileFactoryInSyncWithGame(factory)
  eventBus.emit('factoryUpdated', factory)
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
