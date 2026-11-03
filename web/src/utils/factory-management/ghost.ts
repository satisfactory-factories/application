/**
 * Ghost factories: factories the user has planned but not built yet.
 *
 * A ghost is fully calculated on its own card (products, imports, exports and problems all behave
 * as normal) and is left out of every sum that describes the plan as a whole: power, the Alien
 * Power Augmenter grid boost, raw resources, buildings, items and the power target. That lets a
 * player keep a far-ahead factory in their real plan without it skewing the numbers they build to.
 *
 * Stored as the date it was made a ghost rather than a boolean, so the planner can say how long it
 * has been left out and remind a player who comes back weeks later and has forgotten.
 *
 * Must stay a LEAF, like status.ts: power.ts imports it, and power.ts is reached from factory.ts.
 */
import { Factory } from '@/interfaces/planner/FactoryInterface'

/** How long a ghost waits before the plan reminds you it is there on load. */
export const GHOST_REMINDER_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export const isGhost = (factory: Pick<Factory, 'ghostSince'> | null | undefined): boolean =>
  !!factory?.ghostSince

/** The factories plan-wide totals count. */
export const countedFactories = <T extends Pick<Factory, 'ghostSince'>>(factories: T[]): T[] =>
  factories.filter(factory => !isGhost(factory))

export const ghostFactories = <T extends Pick<Factory, 'ghostSince'>>(factories: T[]): T[] =>
  factories.filter(factory => isGhost(factory))

/**
 * Makes a factory a ghost, or brings it back. Only ever written while on and deleted when off, the
 * same way `ignoreNoDemand` is, so a plan that never uses it saves exactly as it did before.
 */
export const setGhost = (factory: Factory, ghost: boolean, now: Date = new Date()): void => {
  if (ghost) {
    // Already a ghost keeps its original date: the reminder is about how long it has been left out.
    if (!factory.ghostSince) factory.ghostSince = now.toISOString()
    return
  }
  delete factory.ghostSince
}

/** Whole days since the factory was made a ghost. 0 for a fresh ghost or a date that won't parse. */
export const ghostDays = (factory: Pick<Factory, 'ghostSince'>, now: Date = new Date()): number => {
  if (!factory.ghostSince) return 0
  const since = Date.parse(factory.ghostSince)
  if (Number.isNaN(since)) return 0
  return Math.max(0, Math.floor((now.getTime() - since) / DAY_MS))
}

/** "today", "1 day", "3 weeks": how long a ghost has been left out, for chips and the reminder. */
export const ghostAgeLabel = (factory: Pick<Factory, 'ghostSince'>, now: Date = new Date()): string => {
  const days = ghostDays(factory, now)
  if (days === 0) return 'today'
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`
  const weeks = Math.floor(days / 7)
  if (days < 60) return `${weeks} weeks`
  const months = Math.floor(days / 30)
  return `${months} months`
}

/** Ghosts old enough to remind the player about. */
export const staleGhosts = <T extends Pick<Factory, 'ghostSince'>>(factories: T[], now: Date = new Date()): T[] =>
  ghostFactories(factories).filter(factory => ghostDays(factory, now) >= GHOST_REMINDER_DAYS)

export const GHOST_HELP_TEXT = 'A ghost factory is one you have planned but not built yet. ' +
  'It still calculates in full, and its imports and exports stay linked, ' +
  'but it is left out of the plan\'s power, raw resources and other totals.'
