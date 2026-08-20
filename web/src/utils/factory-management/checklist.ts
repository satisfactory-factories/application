// Checklist mode: lets the player tick off products, power producers, imports and exports as they
// build them in game. Products, power producers and inputs carry their own `completed` flag
// directly (they are user-authored, persisted arrays). Exports have no equivalent home: a
// factory's exports are derived from other factories' inputs and rebuilt by the dependency
// engine, so storing state directly on a request risks it being silently dropped. Ticks for
// exports are therefore kept in factory.checklistExports, keyed by the (destination factory,
// part) pair the export chip actually represents.
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { getRequestsForFactory } from '@/utils/factory-management/exports'

export const checklistExportKey = (requestingFactoryId: number | string, part: string): string =>
  `${requestingFactoryId}:${part}`

export const isChecklistExportComplete = (
  factory: Factory,
  requestingFactoryId: number | string,
  part: string
): boolean => !!factory.checklistExports[checklistExportKey(requestingFactoryId, part)]

export const toggleChecklistExport = (
  factory: Factory,
  requestingFactoryId: number | string,
  part: string
): void => {
  const key = checklistExportKey(requestingFactoryId, part)
  factory.checklistExports[key] = !factory.checklistExports[key]
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
