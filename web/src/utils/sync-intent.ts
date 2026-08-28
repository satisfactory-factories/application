import { Factory } from '@/interfaces/planner/FactoryInterface'
import type { TabField } from '@/sync/room-state'
import eventBus from '@/utils/eventBus'

/**
 * One user edit of a factory's stored record. `factoryUpdated` is payload — it saves the
 * plan and schedules the flush; `factoryEdited` is intent, and a rebase carries over only
 * the factories the user is recorded as having touched.
 *
 * Call this from user event handlers only. A watcher on the same data also fires when an
 * inbound op rewrites it, and claiming that as intent makes this client overlay its copy
 * over a peer's edit for ever.
 */
export const markFactoryEdited = (factory: Factory) => {
  eventBus.emit('factoryUpdated', factory)
  eventBus.emit('factoryEdited', factory)
}

/** The same for a field the tab owns rather than one of its factories. */
export const markTabEdited = (field: TabField) => {
  eventBus.emit('tabEdited', field)
}

/** Position in the plan: `displayOrder` plus the group that decides where the record sorts. */
const orderPrint = (factory: Factory) => `${factory.displayOrder}:${factory.group?.id ?? ''}`

export const captureOrder = (factories: Factory[]): Map<number, string> =>
  new Map(factories.map(factory => [factory.id, orderPrint(factory)]))

/**
 * A move, a regroup, a copy or a delete reindexes the whole plan, so the records the user
 * changed are not only the one they acted on. Answers which ones actually moved, against a
 * `captureOrder` taken before the mutation.
 */
export const reorderedFactories = (before: Map<number, string>, factories: Factory[]): Factory[] =>
  factories.filter(factory => before.get(factory.id) !== orderPrint(factory))

export const markReorderedFactories = (before: Map<number, string>, factories: Factory[]) => {
  reorderedFactories(before, factories).forEach(factory => markFactoryEdited(factory))
}
