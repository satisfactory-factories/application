import { usePlannerOptions } from '@/composables/usePlannerOptions'

// Past this many effective buildings the allowance stops growing. A percentage on its own gets
// more generous the bigger the item is — 1% of 100 buildings is a whole building — and a factory
// that large is exactly where a whole building of drift matters least to spot and most to fix.
const TOLERANCE_CEILING_BUILDINGS = 10

/**
 * How far a group set may sit from what its item asks for and still count as balanced, in
 * effective buildings.
 *
 * Proportional rather than flat, because "0.1 of a building" means wildly different rates
 * depending on what the building is: 0.1 of a Miner Mk.1 is 6/min, 0.1 of a Constructor making
 * rods is 1.5/min. A 360/min mine was reading balanced while 6/min short.
 */
export const balanceTolerance = (requiredBuildings: number): number => {
  const percent = usePlannerOptions().value.balanceTolerancePercent
  return Math.min(Math.abs(requiredBuildings), TOLERANCE_CEILING_BUILDINGS) * (percent / 100)
}

// The same judgement the status line and the engine's problem flag both make, in one place so
// they can never disagree.
export const isWithinBalanceTolerance = (remainingBuildings: number, requiredBuildings: number): boolean =>
  Math.abs(remainingBuildings) <= balanceTolerance(requiredBuildings)
