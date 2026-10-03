import { CAPS } from 'common'

import eventBus from '@/utils/eventBus'

/**
 * The most factories a plan may hold. The server refuses a cloud plan, a share link or an
 * op past it, so the planner stops adding at the same number rather than let a plan grow
 * into one the server will not take.
 */
export const MAX_FACTORIES_PER_PLAN = CAPS.factoriesPerRoom

/** The plan has reached the cap: nothing more may be added to it. */
export const planIsFull = (factoryCount: number): boolean => factoryCount >= MAX_FACTORIES_PER_PLAN

/**
 * The plan is past the cap. Adding stops at the cap, so only a plan that arrived whole gets
 * here: an import, a template, an old save, or one built before the cap existed.
 */
export const planIsOverCap = (factoryCount: number): boolean => factoryCount > MAX_FACTORIES_PER_PLAN

/** Close enough to the cap that the count is worth showing before it bites. */
export const planIsNearCap = (factoryCount: number): boolean =>
  factoryCount >= Math.floor(MAX_FACTORIES_PER_PLAN * 0.9)

export const PLAN_FULL_MESSAGE =
  `A plan can hold up to ${MAX_FACTORIES_PER_PLAN} factories. Delete one, or start the next part of your build in a new tab.`

/**
 * Every way of adding a single factory asks here first. True means the add may go ahead;
 * false means the plan is full and the person has been told why nothing happened.
 */
export const canAddFactory = (factoryCount: number, adding = 1): boolean => {
  // Nothing new is a change the cap has no say in, even on a plan that arrived over it.
  if (adding <= 0 || factoryCount + adding <= MAX_FACTORIES_PER_PLAN) return true
  eventBus.emit('toast', { message: PLAN_FULL_MESSAGE, type: 'warning', variant: 'timed', timeout: 8_000 })
  return false
}
