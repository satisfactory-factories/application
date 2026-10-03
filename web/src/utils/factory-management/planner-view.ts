import { Factory } from '@/interfaces/planner/FactoryInterface'
import { FactoryGroupSection } from '@/utils/factory-management/factory-groups'

/**
 * What the planner pane is showing. It renders one page at a time rather than the whole plan:
 * either the overview (Statistics, the Global Factories Summary and the Dimensional Depot) or a
 * single factory, named by its id. Mounting every card at once is what made a big plan lag and
 * crash the tab, and the sidebar is how the plan is navigated anyway.
 */
export const OVERVIEW = 'overview'
export type PlannerView = typeof OVERVIEW | number

export const isPlannerView = (value: unknown): value is PlannerView =>
  value === OVERVIEW || (typeof value === 'number' && Number.isFinite(value))

/** The order the sidebar lists factories in, which is the order next and previous walk. */
export const sidebarOrder = (sections: FactoryGroupSection[]): Factory[] =>
  sections.flatMap(section => section.factories)

export interface FactoryNeighbours {
  // The overview sits before the first factory, so previous always goes somewhere.
  previous: Factory | typeof OVERVIEW
  // Null on the last factory: there is nothing after it.
  next: Factory | null
}

export const neighboursOf = (order: Factory[], factoryId: number): FactoryNeighbours => {
  const index = order.findIndex(factory => factory.id === factoryId)
  if (index === -1) return { previous: OVERVIEW, next: order[0] ?? null }
  return {
    previous: index > 0 ? order[index - 1] : OVERVIEW,
    next: order[index + 1] ?? null,
  }
}

/**
 * Where the pane goes when a factory is deleted: the one after it, so deleting a run of factories
 * is a matter of pressing delete repeatedly, or the one before it when it was the last, or the
 * overview once nothing is left.
 */
export const viewAfterRemoving = (order: Factory[], factoryId: number): PlannerView => {
  const { previous, next } = neighboursOf(order, factoryId)
  if (next) return next.id
  return previous === OVERVIEW ? OVERVIEW : previous.id
}

/** The view as a string, for the browser's history state; `parseView` reads it back. */
export const serialiseView = (view: PlannerView): string => String(view)

export const parseView = (value: string): PlannerView | null => {
  if (value === OVERVIEW) return OVERVIEW
  const id = Number.parseInt(value, 10)
  return Number.isNaN(id) ? null : id
}
