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
  //
  // NOTE this is narrower than `kind === 'internal'`: an export request counts as delivered even
  // when the factory asking is a sibling in the same group, so a mine feeding the smelter next to
  // it is not `internal`. That is deliberate and the display option depends on it. `kind` asks the
  // other question — does the part leave the group — and the two disagree on exactly that case.
  internal: boolean
  // What the group does with it, for the badge on its tile.
  kind: GroupProductKind
}

// What the group does with the part, as one of three exclusive answers.
export type GroupProductKind = 'export' | 'internal' | 'product'

/**
 * The corner badge a product tile wears, and what it means in words.
 *
 * One definition for both display sites — the sidebar's product row and the Options dialog's
 * preview of it — so a badge cannot come to mean two different things. The label is the tooltip's
 * second line: the badge itself is a 9px glyph, which can hint at a meaning but not state one.
 */
export const groupProductKinds: Record<GroupProductKind, {
  icon: string
  // Tooltip line under a tile's name and figure.
  label: string
  // Section heading where the parts of one kind are listed together.
  heading: string
}> = {
  export: {
    // The same truck the Exports column and the export-shortage status wear, so the badge means
    // what "export" already means everywhere else in the planner.
    icon: 'fas fa-truck-container',
    label: 'Shipped to a factory outside this group',
    heading: 'Exported outside this group',
  },
  internal: {
    // A cycle rather than an arrow: the part goes round inside the group instead of leaving it,
    // and an arrow pointing out of a tile said the opposite of what this means. `fa-sync`, not
    // `fa-arrows-rotate` — the app self-hosts a Font Awesome 5 bundle, where the v6 name draws
    // nothing at all. Check public/assets/js/fa-solid.min.js before using an icon name here.
    icon: 'fas fa-sync',
    label: 'Stays inside this group',
    heading: 'Used internally',
  },
  product: {
    icon: 'fas fa-box',
    label: 'Made here, with nothing asking for it',
    // A fault rather than a destination, and named the same as the status chip that reports it so
    // the two are recognisably the same thing.
    heading: 'No demand',
  },
}

// Below this the figure is float noise from a reverse-solve, not a real imbalance.
const EPSILON = 0.001

type SummablePartField =
  | 'amountRemaining' |
  'amountRequiredExports' |
  'amountRequiredPower' |
  'amountRequiredBuildings' |
  'amountRequiredProduction' |
  'amountSuppliedViaProduction'

const sumPart = (factories: Factory[], partId: string, field: SummablePartField) =>
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

  const memberIds = new Set(factories.map(factory => factory.id))

  return partIds.map(partId => ({
    partId,
    net: sumPart(factories, partId, 'amountRemaining'),
    internal: isInternal(factories, partId),
    kind: kindOf(factories, memberIds, partId),
  }))
}

// One end of a part's journey: a factory, and how much of it is involved.
export interface GroupProductFlow {
  factoryId: number
  amount: number
}

const sortByAmount = (flows: GroupProductFlow[]) => flows.sort((a, b) => b.amount - a.amount)

/**
 * Who outside the group asks this group for a part, and how much of it.
 *
 * Requests are held per factory keyed by the factory asking, so this walks every member's requests
 * and keeps the ones from a non-member. Summed per requester: two factories in the group can both
 * ship the same part to the same outside factory.
 */
export const groupExportRequests = (factories: Factory[], partId: string): GroupProductFlow[] => {
  const memberIds = new Set(factories.map(factory => factory.id))
  const totals = new Map<number, number>()

  for (const factory of factories) {
    for (const requests of Object.values(factory.dependencies?.requests ?? {})) {
      for (const request of requests) {
        if (request.part !== partId || request.amount <= 0) continue
        if (memberIds.has(request.requestingFactoryId)) continue
        totals.set(
          request.requestingFactoryId,
          (totals.get(request.requestingFactoryId) ?? 0) + request.amount
        )
      }
    }
  }

  return sortByAmount([...totals].map(([factoryId, amount]) => ({ factoryId, amount })))
}

// Which factories in the group make a part, and how much each makes. This is what names the factory
// to go and look at when nothing wants the part.
export const groupProducers = (factories: Factory[], partId: string): GroupProductFlow[] =>
  sortByAmount(factories
    .filter(factory => (factory.parts[partId]?.amountSuppliedViaProduction ?? 0) > 0)
    .map(factory => ({
      factoryId: factory.id,
      amount: factory.parts[partId].amountSuppliedViaProduction,
    })))

// Past this the +N tooltip is taller than the sidebar and stops reading as a list.
export const OVERFLOW_TOOLTIP_LIMIT = 10

/**
 * The lines the +N tooltip shows: one per hidden part, capped, with a final line counting what was
 * left out. Joined with commas this was a single wrapped paragraph, and at 20-odd parts none of it
 * was findable.
 *
 * The last line matters as much as the cap: a truncated list that does not say it is truncated
 * reads as the whole of what is hidden.
 */
export const overflowLines = (labels: string[], limit = OVERFLOW_TOOLTIP_LIMIT): string[] => {
  const listed = labels.slice(0, limit)
  const rest = labels.length - listed.length
  return rest > 0 ? [...listed, `and ${rest} more`] : listed
}

// Whether any factory in the group is asked for this part, by someone in or out of the group.
const requestedFrom = (
  factories: Factory[], memberIds: Set<number>, partId: string, byMember: boolean
): boolean =>
  factories.some(factory =>
    Object.values(factory.dependencies?.requests ?? {}).some(requests =>
      requests.some(request =>
        request.part === partId &&
        request.amount > 0 &&
        memberIds.has(request.requestingFactoryId) === byMember
      )
    )
  )

/**
 * Which badge the part's tile wears, and which table of the group breakdown it lands in.
 *
 * The question is only where the part goes. `internal` cannot answer it: that flag also demands the
 * part *balance*, deliberately, because the display option hides internal rows and a shortfall must
 * never be hidden. Using it here classified a part that is made and consumed on the spot but does
 * not balance as `product`, so Water at Uranium Power was reported as having no demand while the
 * same factory was drinking all of it.
 *
 * So consumption is asked about directly. Outside requests come first: a part can go both ways at
 * once, and leaving the group is the more useful of the two answers. Whether it balances is the
 * `net` figure's job, shown alongside.
 */
const kindOf = (
  factories: Factory[], memberIds: Set<number>, partId: string
): GroupProductKind => {
  if (requestedFrom(factories, memberIds, partId, false)) return 'export'
  // Handed to a sibling, or consumed on the spot. Either way it never leaves the group.
  //
  // Every kind of consumption counts. `amountRequiredProduction` is what recipes eat;
  // `amountRequiredPower` is what generators burn, and leaving it out reported Uranium Fuel Rods
  // fed straight into a Nuclear Power Plant as having no demand. Water is the same story on a
  // generator's water input. `amountRequiredBuildings` is custom building upkeep — Singularity
  // Cells fed to a portal room. See calculateParts, where `amountRequired` sums these three plus
  // exports for exactly this reason.
  const consumedInside = sumPart(factories, partId, 'amountRequiredProduction') > 0 ||
    sumPart(factories, partId, 'amountRequiredPower') > 0 ||
    sumPart(factories, partId, 'amountRequiredBuildings') > 0
  return requestedFrom(factories, memberIds, partId, true) || consumedInside ? 'internal' : 'product'
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
