import { Factory } from '@/interfaces/planner/FactoryInterface'

/**
 * Above this many factories a plan cannot be mounted in one flush without visibly locking
 * the tab, so the loader paces the render whether or not anything needed calculating.
 * `Loading.vue` warns the user at the same boundary.
 */
export const PACED_RENDER_FACTORY_COUNT = 10

/** Whether this plan is big enough that rendering it needs the staggered loader. */
export const needsPacedRender = (plan: Factory[]): boolean =>
  plan.length > PACED_RENDER_FACTORY_COUNT
