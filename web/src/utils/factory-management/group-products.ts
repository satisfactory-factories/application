import { Factory } from '@/interfaces/planner/FactoryInterface'

/**
 * What a group of factories makes, summarised for the sidebar's one-line product row.
 *
 * The row answers "what does this folder deliver, and is it keeping up" — not "what parts appear
 * somewhere inside it". Those are different questions, and conflating them is what put Concrete
 * on the Uranium Power row: made there, consumed there, of interest to nobody outside it.
 */
export interface GroupProduct {
  partId: string
  // Surplus (+) or shortfall (-) across the whole group, once its own consumption and everything
  // it ships out are accounted for.
  net: number
  // Produced inside the group, consumed inside the group, nothing outside asks for it, and it
  // balances. See isInternal below for why the balance is part of it.
  internal: boolean
}

// Below this the figure is float noise from a reverse-solve, not a real imbalance.
const EPSILON = 0.001

const sumPart = (factories: Factory[], partId: string, field: 'amountRemaining' | 'amountRequiredExports' | 'amountRequiredProduction' | 'amountSuppliedViaProduction') =>
  factories.reduce((total, factory) => total + (factory.parts[partId]?.[field] ?? 0), 0)

/**
 * Every part any factory in the group produces, deduped and in the order the factories declare
 * them, so the icons stay put as the plan changes rather than reshuffling on every recalculation.
 */
export const collectGroupProducts = (factories: Factory[]): GroupProduct[] => {
  const partIds: string[] = []
  const seen = new Set<string>()

  for (const factory of factories) {
    for (const product of factory.products) {
      if (seen.has(product.id)) continue
      seen.add(product.id)
      partIds.push(product.id)
    }
  }

  return partIds.map(partId => ({
    partId,
    net: sumPart(factories, partId, 'amountRemaining'),
    internal: isInternal(factories, partId),
  }))
}

/**
 * A part the group makes purely for itself.
 *
 * Three things have to hold. It is produced in the group; nothing outside asks for it (an export
 * request means it is shipped somewhere, and where it lands does not matter — a sibling in the
 * same folder still counts as delivered); and the group's own production consumes it.
 *
 * And it has to balance. A surplus with nowhere to go, or a shortfall, is exactly the thing this
 * row exists to surface — hiding one because the part happens to be consumed on site would mean
 * the summary quietly omits the problem it is meant to report.
 */
const isInternal = (factories: Factory[], partId: string): boolean => {
  const produced = sumPart(factories, partId, 'amountSuppliedViaProduction')
  const exported = sumPart(factories, partId, 'amountRequiredExports')
  const consumed = sumPart(factories, partId, 'amountRequiredProduction')
  const net = sumPart(factories, partId, 'amountRemaining')

  return produced > 0 && exported <= 0 && consumed > 0 && Math.abs(net) < EPSILON
}
