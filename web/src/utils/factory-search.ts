// Plan-wide search: the mechanism behind the search box in the tab bar.
//
// Two things are searchable, in the order issue #611 asks for them:
//   1. Factory names, fuzzy-matched.
//   2. Parts, with the factories that touch them ranked by what they do with the part —
//      production first, then byproducts, then everything else (imports, exports, extraction
//      and plain ingredient demand).
//
// The cost of the second one is the whole reason this file exists rather than a computed in the
// component. Scoring every (factory, part) pair on every keystroke is O(factories x parts) with a
// fuzzy match on each — a 60-factory plan carries a few thousand of those pairs, and the search
// runs while the user is still typing. So the plan is indexed ONCE per change (buildPlanSearchIndex)
// into a part-keyed map, and a search then scores only the plan's DISTINCT parts — tens to low
// hundreds — before looking their factories up in the map. Typing is O(distinct parts), and the
// index is rebuilt only when the plan does.

import { Factory } from '@/interfaces/planner/FactoryInterface'
import { fuzzyScore } from '@/utils/fuzzySearch'
import { getPartDisplayName } from '@/utils/helpers'
import { productRowId } from '@/utils/factory-management/products'
import { importRowId } from '@/utils/factory-management/inputs-analysis'

// What a factory does with a part. Ordered by the priority the results are ranked in: the first
// two are the roles issue #611 names, the rest are its "other usage".
export enum PartUsageKind {
  Produced = 'produced',
  Byproduct = 'byproduct',
  Exported = 'exported',
  Imported = 'imported',
  Consumed = 'consumed'
}

// The three buckets results are grouped into. Several usage kinds collapse into `Other`.
export enum PartSearchRole {
  Production = 'production',
  Byproduct = 'byproduct',
  Other = 'other'
}

// Lower sorts first. A factory that both makes a part and ships it out is listed once, under the
// strongest thing it does with it — the same factory under two headings says nothing new.
const USAGE_PRIORITY: Record<PartUsageKind, number> = {
  [PartUsageKind.Produced]: 0,
  [PartUsageKind.Byproduct]: 1,
  [PartUsageKind.Exported]: 2,
  [PartUsageKind.Imported]: 3,
  [PartUsageKind.Consumed]: 4,
}

const USAGE_ROLE: Record<PartUsageKind, PartSearchRole> = {
  [PartUsageKind.Produced]: PartSearchRole.Production,
  [PartUsageKind.Byproduct]: PartSearchRole.Byproduct,
  [PartUsageKind.Exported]: PartSearchRole.Other,
  [PartUsageKind.Imported]: PartSearchRole.Other,
  [PartUsageKind.Consumed]: PartSearchRole.Other,
}

export const ROLE_ORDER: PartSearchRole[] = [
  PartSearchRole.Production,
  PartSearchRole.Byproduct,
  PartSearchRole.Other,
]

export const ROLE_LABEL: Record<PartSearchRole, string> = {
  [PartSearchRole.Production]: 'Production',
  [PartSearchRole.Byproduct]: 'Byproduct',
  [PartSearchRole.Other]: 'Other usage',
}

// The verb each row wears next to its amount. "Other usage" covers four different things, and
// which one it is decides where the row jumps to, so the row says it.
export const USAGE_LABEL: Record<PartUsageKind, string> = {
  [PartUsageKind.Produced]: 'Produces',
  [PartUsageKind.Byproduct]: 'Byproduct',
  [PartUsageKind.Exported]: 'Exports',
  [PartUsageKind.Imported]: 'Imports',
  [PartUsageKind.Consumed]: 'Uses',
}

export interface FactorySummary {
  id: number
  name: string
  icon?: string
  displayOrder: number
}

export interface PartUsageEntry {
  factory: FactorySummary
  kind: PartUsageKind
  amount: number
  // Only set for an import: the factory it comes from, which is half of the import row's id.
  // `null` for a half-configured import, which has no row of its own to land on.
  sourceFactoryId?: number | null
}

export interface PlanSearchIndex {
  factories: FactorySummary[]
  // Every distinct part the plan touches, with its display name resolved once.
  parts: { id: string, name: string }[]
  // partId -> every factory that touches it, strongest usage first.
  usages: Map<string, PartUsageEntry[]>
}

export interface FactoryNameResult {
  factory: FactorySummary
  score: number
}

export interface PartSearchGroup {
  role: PartSearchRole
  usages: PartUsageEntry[]
  // Usages dropped by the per-group cap, so the UI can say how many it is not showing.
  hidden: number
}

export interface PartSearchResult {
  partId: string
  partName: string
  score: number
  groups: PartSearchGroup[]
  // How many factories touch this part in total, across every group and including the hidden ones.
  factoryCount: number
}

export interface PlanSearchResults {
  factories: FactoryNameResult[]
  parts: PartSearchResult[]
  // Results dropped by the top-level caps, for the same reason as `hidden` above.
  hiddenFactories: number
  hiddenParts: number
}

export interface PlanSearchLimits {
  maxFactories?: number
  maxParts?: number
  maxUsagesPerRole?: number
}

// Deliberately small. This is a navigation aid dropping out of a toolbar, not a report: past a
// handful of rows per heading the list stops being scannable and the user is better served by
// typing another character.
const DEFAULT_LIMITS: Required<PlanSearchLimits> = {
  maxFactories: 8,
  maxParts: 6,
  maxUsagesPerRole: 6,
}

const summarise = (factory: Factory): FactorySummary => ({
  id: factory.id,
  name: factory.name,
  icon: factory.icon,
  displayOrder: factory.displayOrder,
})

/**
 * Walks the plan once and records, for every part it touches, which factories touch it and how.
 *
 * Rebuild this when the plan changes, not when the query does — see the note at the top of the
 * file for why.
 */
export const buildPlanSearchIndex = (factories: Factory[]): PlanSearchIndex => {
  const usages = new Map<string, PartUsageEntry[]>()
  // Keyed part -> factory, so the strongest usage wins and a factory is never listed twice for
  // the same part. Insertion order is the factory order, which the sort below preserves on ties.
  const best = new Map<string, Map<number, PartUsageEntry>>()

  const record = (
    partId: string,
    factory: FactorySummary,
    kind: PartUsageKind,
    amount: number,
    sourceFactoryId?: number | null,
  ) => {
    if (!partId) return

    const forPart = best.get(partId) ?? new Map<number, PartUsageEntry>()
    best.set(partId, forPart)

    const existing = forPart.get(factory.id)
    if (existing && USAGE_PRIORITY[existing.kind] <= USAGE_PRIORITY[kind]) {
      // Already recorded under a stronger (or equal) role. An equal one means a second row of the
      // same kind — a factory importing one part from two places — so add the amounts up.
      if (existing.kind === kind) existing.amount += amount
      return
    }

    forPart.set(factory.id, { factory, kind, amount, sourceFactoryId })
  }

  factories.forEach(factory => {
    const summary = summarise(factory)

    factory.products?.forEach(product => record(product.id, summary, PartUsageKind.Produced, product.amount))
    factory.byProducts?.forEach(byProduct => record(byProduct.id, summary, PartUsageKind.Byproduct, byProduct.amount))

    // Power producers' waste (a Nuclear Power Plant's Uranium Waste) is a byproduct of the plan
    // like any other, and is not in factory.byProducts.
    factory.powerProducers?.forEach(producer => {
      if (producer.byproduct?.part) {
        record(producer.byproduct.part, summary, PartUsageKind.Byproduct, producer.byproduct.amount)
      }
    })

    Object.values(factory.dependencies?.requests ?? {}).flat().forEach(request => {
      record(request.part, summary, PartUsageKind.Exported, request.amount)
    })

    factory.inputs?.forEach(input => {
      if (!input.outputPart) return
      record(input.outputPart, summary, PartUsageKind.Imported, input.amount, input.factoryId)
    })

    // The catch-all, and the reason a part the factory merely eats is findable at all: every part
    // a factory touches has a row in its satisfaction table, which is where these jump to.
    //
    // This is also what covers a raw shortage: `factory.rawResources` is the ore the factory needs
    // and neither mines nor imports, which is already in here as demand. A factory that DOES mine
    // its own ore holds an extractor product, so that lands under production above.
    Object.entries(factory.parts ?? {}).forEach(([partId, metrics]) => {
      if (metrics.amountRequired > 0) record(partId, summary, PartUsageKind.Consumed, metrics.amountRequired)
    })
  })

  best.forEach((forPart, partId) => {
    usages.set(partId, [...forPart.values()].sort((a, b) =>
      USAGE_PRIORITY[a.kind] - USAGE_PRIORITY[b.kind] ||
      a.factory.displayOrder - b.factory.displayOrder))
  })

  return {
    factories: factories.map(summarise),
    parts: [...usages.keys()].map(id => ({ id, name: getPartDisplayName(id) })),
    usages,
  }
}

// Display names only. The internal ids are tempting to score as well — someone pasting
// "IronPlate" out of a share link should find it, and does, because the fuzzy matcher reads it as
// a subsequence of "Iron Plate" anyway. Scoring the ids directly instead surfaced parts whose
// legacy id says something their name does not: "circuit" matched AI Limiter, whose id is
// CircuitBoardHighTier, and no amount of ranking makes that read as anything but a bug.

/**
 * Runs a query against a prebuilt index. Cheap enough to call on every keystroke — see the note
 * at the top of the file.
 */
export const searchPlan = (
  query: string,
  index: PlanSearchIndex,
  limits: PlanSearchLimits = {},
): PlanSearchResults => {
  const { maxFactories, maxParts, maxUsagesPerRole } = { ...DEFAULT_LIMITS, ...limits }
  const trimmed = query.trim()

  if (!trimmed) {
    return { factories: [], parts: [], hiddenFactories: 0, hiddenParts: 0 }
  }

  const factoryMatches = index.factories
    .map(factory => ({ factory, score: fuzzyScore(trimmed, factory.name) }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.factory.displayOrder - b.factory.displayOrder)

  const partMatches = index.parts
    .map(part => ({ part, score: fuzzyScore(trimmed, part.name) }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.part.name.localeCompare(b.part.name))

  const parts: PartSearchResult[] = partMatches.slice(0, maxParts).map(({ part, score }) => {
    const usages = index.usages.get(part.id) ?? []

    const groups = ROLE_ORDER
      .map(role => {
        const inRole = usages.filter(usage => USAGE_ROLE[usage.kind] === role)
        return {
          role,
          usages: inRole.slice(0, maxUsagesPerRole),
          hidden: Math.max(0, inRole.length - maxUsagesPerRole),
        }
      })
      .filter(group => group.usages.length > 0)

    return { partId: part.id, partName: part.name, score, groups, factoryCount: usages.length }
  })

  return {
    factories: factoryMatches.slice(0, maxFactories),
    parts,
    hiddenFactories: Math.max(0, factoryMatches.length - maxFactories),
    hiddenParts: Math.max(0, partMatches.length - maxParts),
  }
}

export const hasResults = (results: PlanSearchResults): boolean =>
  results.factories.length > 0 || results.parts.length > 0

/**
 * Where clicking a result row takes the user: the row for that part inside that factory, with the
 * section it lives in as the fallback for a card that has not rendered yet. Mirrors what the
 * status chips do — landing on the factory card alone only says "somewhere in here".
 */
export const usageJumpTarget = (
  partId: string,
  usage: PartUsageEntry,
): { targets: string[], fallback: string } => {
  const factoryId = usage.factory.id

  switch (usage.kind) {
    case PartUsageKind.Produced:
    case PartUsageKind.Byproduct:
      // Byproducts share the row of the product that makes them — see productRowId.
      return { targets: [productRowId(factoryId, partId)], fallback: `${factoryId}-products` }
    case PartUsageKind.Imported: {
      const rowId = importRowId(factoryId, usage.sourceFactoryId ?? null, partId)
      return { targets: rowId ? [rowId] : [], fallback: `${factoryId}-imports` }
    }
    default:
      // Exports and plain demand (raw shortages included) both have a satisfaction row.
      return {
        targets: [`${factoryId}-satisfaction-item-${partId}`],
        fallback: `${factoryId}-satisfaction`,
      }
  }
}
