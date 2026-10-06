/**
 * as-built.ts — what an item's building groups actually make, against what the plan says.
 *
 * With Sync off, an item's Qty/min and its building groups are free to disagree, and every other
 * figure in the planner (satisfaction, exports, fuel) is worked out from the Qty/min. So a product
 * planned at 950/min whose groups only add up to 720/min reads as exactly satisfied, and the only
 * sign of the 230/min the factory will really be short is the Building Groups bar on the product
 * itself. These helpers put a number on that gap, so the satisfaction table can show it on the
 * part where the shortage would actually be felt.
 *
 * Only items the engine has already flagged (buildingGroupsHaveProblem) count, so the figures
 * share the balance tolerance of the red bar and can never disagree with it.
 *
 * Kept a leaf: nothing here reaches factory.ts, so status.ts and the components can import it.
 */
import { Factory, FactoryItem, FactoryPowerProducer, ItemType } from '@/interfaces/planner/FactoryInterface'
import { formatNumberFully } from '@/utils/numberFormatter'
import { isSunk } from '@/utils/factory-management/disposal'

export type AsBuiltRole = 'output' | 'ingredient'

// One item's contribution to a part's as-built difference.
export interface AsBuiltSource {
  type: ItemType
  // A product's item id, or a power producer's building — a producer's `id` is a random
  // instance number, not something a reader can recognise.
  subject: string
  role: AsBuiltRole
  planned: number
  asBuilt: number
}

export interface AsBuiltPartDifference {
  // What the groups change about the part's surplus: negative is less of it than the plan says.
  // An output made short lowers it; an ingredient consumed short raises it.
  surplusDelta: number
  // The part's surplus (negative: shortage) once the groups are counted, after any AWESOME Sink
  // on it has taken its share. Compare with the part's amountRemaining.
  remaining: number
  sources: AsBuiltSource[]
}

const sumGroupPart = (item: FactoryItem | FactoryPowerProducer, part: string): number =>
  formatNumberFully(
    (item.buildingGroups ?? []).reduce((total, group) => total + (group.parts?.[part] ?? 0), 0),
    3
  )

// Every part the item touches, with the rate the plan assigns it.
const plannedParts = (
  item: FactoryItem | FactoryPowerProducer,
  type: ItemType
): { part: string, role: AsBuiltRole, planned: number }[] => {
  if (type === ItemType.Product) {
    const product = item as FactoryItem
    return [
      { part: product.id, role: 'output' as const, planned: product.amount },
      ...(product.byProducts ?? []).map(byProduct => ({
        part: byProduct.id,
        role: 'output' as const,
        planned: byProduct.amount,
      })),
      ...Object.entries(product.requirements ?? {}).map(([part, requirement]) => ({
        part,
        role: 'ingredient' as const,
        planned: requirement.amount,
      })),
    ]
  }

  const producer = item as FactoryPowerProducer
  return [
    ...(producer.ingredients ?? []).map(ingredient => ({
      part: ingredient.part,
      role: 'ingredient' as const,
      planned: ingredient.perMin,
    })),
    ...(producer.byproduct
      ? [{ part: producer.byproduct.part, role: 'output' as const, planned: producer.byproduct.amount }]
      : []),
  ]
}

// The parts on one item whose groups make or use a different amount than planned. Empty for an
// item whose groups are within tolerance.
export const getItemAsBuiltSources = (
  item: FactoryItem | FactoryPowerProducer,
  type: ItemType
): { part: string, source: AsBuiltSource }[] => {
  if (!item.buildingGroupsHaveProblem || !item.buildingGroups?.length) return []

  const subject = type === ItemType.Product
    ? (item as FactoryItem).id
    : (item as FactoryPowerProducer).building

  return plannedParts(item, type).flatMap(({ part, role, planned }) => {
    if (!part) return []
    const asBuilt = sumGroupPart(item, part)
    if (formatNumberFully(asBuilt - planned, 3) === 0) return []
    return [{ part, source: { type, subject, role, planned, asBuilt } }]
  })
}

// What the groups make of one output, for the product row. Null when the groups agree with the
// plan, so the caller has nothing to show.
export const getAsBuiltOutput = (product: FactoryItem): number | null => {
  const source = getItemAsBuiltSources(product, ItemType.Product)
    .find(entry => entry.part === product.id)
  return source ? source.source.asBuilt : null
}

// A sink only ever takes what nothing else claimed, so it absorbs the groups' difference too: a
// sunk byproduct made 60/min short as built is sunk 60/min less, not 60/min short. Mirrors
// calculateParts, starting from the surplus before the sink had its share.
const asBuiltRemaining = (factory: Factory, partId: string, surplusDelta: number): number => {
  const part = factory.parts[partId]
  if (!part) return formatNumberFully(surplusDelta, 3)

  const preSink = part.amountRemainingPreSink ?? part.amountRemaining + (part.amountRequiredSink ?? 0)
  const asBuilt = preSink + surplusDelta
  const sunk = part.isSinkable && isSunk(factory, partId) ? Math.max(0, asBuilt) : 0

  return formatNumberFully(asBuilt - sunk, 3)
}

// Every part in the factory the groups would leave at a different surplus than the plan shows.
export const getAsBuiltDifferences = (factory: Factory): Record<string, AsBuiltPartDifference> => {
  const result: Record<string, AsBuiltPartDifference> = {}

  const entries = [
    ...factory.products.flatMap(product => getItemAsBuiltSources(product, ItemType.Product)),
    ...factory.powerProducers.flatMap(producer => getItemAsBuiltSources(producer, ItemType.Power)),
  ]

  for (const { part, source } of entries) {
    const difference = source.asBuilt - source.planned
    const entry = result[part] ??= { surplusDelta: 0, remaining: 0, sources: [] }
    entry.surplusDelta += source.role === 'output' ? difference : -difference
    entry.sources.push(source)
  }

  // A part whose surplus comes out the same as built has nothing to say: two items cancelling each
  // other out (one group set over and another under), or a sink absorbing the difference.
  for (const part of Object.keys(result)) {
    const entry = result[part]
    entry.surplusDelta = formatNumberFully(entry.surplusDelta, 3)
    entry.remaining = asBuiltRemaining(factory, part, entry.surplusDelta)
    const planned = formatNumberFully(factory.parts[part]?.amountRemaining ?? 0, 3)
    if (entry.surplusDelta === 0 || entry.remaining === planned) delete result[part]
  }

  return result
}
