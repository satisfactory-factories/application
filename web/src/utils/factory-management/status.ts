/**
 * status.ts — the registry of factory status conditions.
 *
 * `factory.hasProblem` used to be the only signal a factory gave: one boolean, three unrelated
 * causes, and nowhere for anything short of "broken" to appear. This replaces the detection behind
 * it with a registry of typed, severity-tiered conditions derived from data the engine already
 * computes. Every display site (sidebar entry, card border and header chips, Factories Summary row,
 * section headers) reads this list rather than a named flag.
 *
 * ADDING A STATUS: one entry in `factoryStatusDefinitions` plus its spec cases. Nothing else — no
 * template edits, no new SCSS, no migration. That property is the whole point; don't break it by
 * special-casing a type at a display site.
 *
 * TIER RULE: red is arithmetic, amber is judgement. If the condition is decidable by comparing two
 * numbers the engine produced, it is a `problem`. If deciding it needs a guess about what the user
 * meant — or it is about the world rather than the plan — it is a `warning`.
 *
 * The third tier, `note`, is for a state that is worth counting but is very often deliberate. It
 * gets a chip like any other status and is left out of the colour rollup entirely, so the factory
 * stays green. Same reasoning as the `hand-gathered` chip: an observation, not a fault.
 *
 * This module must stay a LEAF. `problems.ts` imports it and is itself imported by `factory.ts`, so
 * importing anything that reaches `factory.ts` closes a cycle. That is why the import predicates
 * live in `inputs-analysis.ts`.
 */
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { isDuplicateImport, isImportRedundant } from '@/utils/factory-management/inputs-analysis'
import { isSurplusSignificant } from '@/utils/factory-management/parts'

export type FactoryStatusSeverity = 'problem' | 'warning' | 'note'

// Element-id suffix of the card section a status points at, for navigateToFactory().
export type FactoryStatusSection = 'satisfaction' | 'imports' | 'products'

export type FactoryStatusType =
  | 'partShortage' |
  'exportShortage' |
  'buildingGroupMismatch' |
  'outOfSync' |
  'unhandledByproduct' |
  'redundantImport' |
  'duplicateImport' |
  'noDemand' |
  'potentialBlockage'

// `type` maps straight onto <game-asset>'s prop. A power producer's `id` is a random instance
// number, NOT an item id, so building-group statuses carry its building instead.
export interface FactoryStatusSubject {
  id: string
  type: 'item' | 'building'
}

export interface FactoryStatus {
  type: FactoryStatusType
  severity: FactoryStatusSeverity
  label: string // condensed, for the sidebar
  detailLabel: string // fuller, for section headers
  detail: string // tooltip sentence
  icon: string // FA class, used when there is no single subject icon to show
  chip: boolean // false = drives colour and precedence only
  section?: FactoryStatusSection
  subjects: FactoryStatusSubject[]
}

interface FactoryStatusDefinition {
  type: FactoryStatusType
  severity: FactoryStatusSeverity
  icon: string
  chip: boolean
  section?: FactoryStatusSection
  detail: string
  // null means "does not apply". An empty array means "applies, with no listable subjects" —
  // the distinction is why this can't just return an array.
  detect: (factory: Factory) => FactoryStatusSubject[] | null
  label: (subjects: FactoryStatusSubject[]) => string
  // Optional; falls back to `label` where a fuller phrasing adds nothing.
  detailLabel?: (subjects: FactoryStatusSubject[]) => string
}

const nonEmpty = (subjects: FactoryStatusSubject[]): FactoryStatusSubject[] | null =>
  subjects.length ? subjects : null

// Deduped: two import rows for the same part are one subject, which is the count to show.
const subjects = (ids: (string | null | undefined)[], type: 'item' | 'building' = 'item'): FactoryStatusSubject[] => {
  const seen = new Set<string>()
  const result: FactoryStatusSubject[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({ id, type })
  }
  return result
}

const defined = (ids: (string | undefined)[]): string[] => ids.filter((id): id is string => !!id)

// What the factory chose to make.
export const factoryProducts = (factory: Factory): string[] =>
  defined(factory.products.map(product => product.id))

// What it gets whether it wants it or not: recipe byproducts and a generator's waste. Kept apart
// from products because the two fail differently — an unwanted product is a waste of buildings,
// an unwanted byproduct backs up and stops the machine making it.
export const factoryByproducts = (factory: Factory): string[] =>
  defined([
    ...factory.byProducts.map(byProduct => byProduct.id),
    ...factory.powerProducers.map(producer => producer.byproduct?.part),
  ])

// Everything the factory puts out, whichever pass made it.
export const factoryOutputs = (factory: Factory): string[] =>
  [...factoryProducts(factory), ...factoryByproducts(factory)]

// An output the game itself never consumes: a Space Elevator part, ammunition, equipment. Having
// no consumer is what these are for, so they get their own chip rather than the noDemand note.
export const isEndProduct = (factory: Factory, partId: string): boolean =>
  !!partId &&
  factory.parts[partId]?.isEndProduct === true &&
  factoryOutputs(factory).includes(partId)

// A byproduct with nowhere to go. Unlike a product you chose to make, you cannot decline it: it
// fills the machine's output slot and stops the line.
//
// Measured on what is LEFT, not on there being no demand at all. Sharing hasNoDemand's
// `amountRequired === 0` test meant one drop of demand switched the warning off completely: an
// import row asking for 0.001/min of a 50/min Heavy Oil Residue byproduct took the factory from
// amber to green while 49.999/min still backed up and stalled the refineries. Exporting 1/min of
// a 10/min byproduct did the same. A product can be trimmed to match its demand; a byproduct
// cannot, so partial demand is still a blockage for the remainder.
//
// How bad that is depends on whether the sink would take it, which is why this splits in two. A
// sinkable solid has a way out you have not drawn yet; a fluid or a radioactive item has none, so
// the line really does stop. Only the second colours the factory.
const undemandedByproduct = (factory: Factory, partId: string): boolean =>
  factoryByproducts(factory).includes(partId) &&
  factory.parts[partId]?.isEndProduct !== true &&
  isSurplusSignificant(factory.parts[partId]?.amountRemaining ?? 0, factory.parts[partId]?.amountRequired ?? 0)

export const isUnhandledByproduct = (factory: Factory, partId: string): boolean =>
  undemandedByproduct(factory, partId) && factory.parts[partId]?.isSinkable === false

export const isPotentialBlockage = (factory: Factory, partId: string): boolean =>
  undemandedByproduct(factory, partId) && factory.parts[partId]?.isSinkable !== false

// Zero demand only. Partial demand is a surplus, which the product row already offers to trim.
export const hasNoDemand = (factory: Factory, partId: string): boolean =>
  !!partId &&
  factory.parts[partId]?.amountRequired === 0 &&
  factory.parts[partId]?.isEndProduct !== true &&
  factoryOutputs(factory).includes(partId)

const count = (list: FactoryStatusSubject[], one: string, many: string) =>
  list.length > 1 ? `${list.length} ${many}` : one

// A factory with no products reports requirementsSatisfied === true regardless of its parts
// (parts.ts), so a power-only factory short of fuel has never read as broken. Mirroring that here
// keeps hasProblem identical on saved plans; whether the underlying guard is right is its own issue.
const hasNoProducts = (factory: Factory) => factory.products.length === 0

// Declared in severity order, so getFactoryStatuses returns them sorted and no display site sorts.
export const factoryStatusDefinitions: FactoryStatusDefinition[] = [
  {
    type: 'partShortage',
    severity: 'problem',
    icon: 'fas fa-exclamation-circle',
    chip: true,
    section: 'satisfaction',
    detail: 'This factory needs more of these parts than it can supply.',
    // Raw and manufactured in one status: a factory short of ore and short of a plate is short,
    // and being told which kind twice never told anyone anything they could act on.
    //
    // The two halves guard differently, which is why this isn't one filter. The products-less
    // guard belongs to manufactured parts only, mirroring calculateParts; raw parts must bypass
    // it, or a generator burning Coal it doesn't import stops reading as short. There is no
    // saved-plan colour to preserve on the raw side either: raw demand counted as satisfied until
    // extraction could be modelled.
    //
    // Hand-gathered resources need no guard: the engine leaves them satisfied, so the
    // !satisfied filter already excludes them.
    detect: factory => {
      const short = (raw: boolean) => Object.keys(factory.parts)
        .filter(part => !factory.parts[part].satisfied && factory.parts[part].isRaw === raw)

      // What the generators burn. The product-less guard skips non-raw shortages, so a power-only
      // factory got opposite answers for the same situation: a Coal Generator with no coal went
      // red because coal is raw, while a Fuel Generator with no fuel stayed green - and a nuclear
      // plant short of rods or water said nothing at all. A generator with no fuel is as broken as
      // a factory with no ore, whichever list the part happens to be on.
      // Custom building upkeep (a Portal's Singularity Cells) is in here for the same reason: a
      // portal room has no products at all, so without this its cells could never read as short.
      const fuels = new Set([
        ...factory.powerProducers.flatMap(
          producer => (producer.ingredients ?? []).map(ingredient => ingredient.part)
        ),
        ...(factory.customBuildings ?? []).flatMap(
          customBuilding => (customBuilding.ingredients ?? []).map(ingredient => ingredient.part)
        ),
      ])

      return nonEmpty(subjects([
        ...(hasNoProducts(factory) ? short(false).filter(part => fuels.has(part)) : short(false)),
        ...short(true),
      ]))
    },
    label: list => count(list, 'Shortage', 'shortages'),
  },
  {
    type: 'exportShortage',
    severity: 'problem',
    icon: 'fas fa-truck-container',
    chip: true,
    section: 'satisfaction',
    detail: 'Another factory is requesting more of these parts than this one supplies.',
    detect: factory => nonEmpty(subjects(
      Object.keys(factory.dependencies?.metrics ?? {})
        .filter(part => !factory.dependencies.metrics[part].isRequestSatisfied)
    )),
    label: list => count(list, 'Export unmet', 'exports unmet'),
    detailLabel: list => count(list, 'Export request unmet', 'export requests unmet'),
  },
  {
    type: 'buildingGroupMismatch',
    severity: 'problem',
    icon: 'fas fa-layer-group',
    chip: true,
    section: 'products',
    detail: 'The building groups on these items do not add up to the buildings the item needs.',
    // Power producers are included deliberately: calculateBuildingGroupProblems has always run for
    // them, but the old hasProblem rollup only ever looked at factory.products, so a broken power
    // producer never reddened its factory.
    detect: factory => nonEmpty([
      ...subjects(factory.products.filter(p => p.buildingGroupsHaveProblem).map(p => p.id)),
      ...subjects(factory.powerProducers.filter(p => p.buildingGroupsHaveProblem).map(p => p.building), 'building'),
    ]),
    label: list => count(list, 'Building groups', 'building groups'),
    detailLabel: list => count(list, 'Building groups do not add up', 'items with building group problems'),
  },
  {
    type: 'unhandledByproduct',
    severity: 'warning',
    icon: 'fas fa-exclamation-triangle',
    chip: true,
    section: 'products',
    detail: 'These byproducts cannot be sunk and nothing consumes them, so they back up and stall the buildings making them.',
    // Amber rather than the noDemand note, and the only byproduct case that colours the factory:
    // nothing you can draw in the planner disposes of a fluid or a radioactive item, so this is a
    // wall rather than a loose end. Plutonium Waste off a Plutonium Fuel Rod line is the case to
    // keep in mind — you cannot choose not to make it, and you cannot sink it either.
    detect: factory => nonEmpty(subjects(
      factoryByproducts(factory).filter(id => isUnhandledByproduct(factory, id))
    )),
    label: list => count(list, 'Unhandled byproduct', 'unhandled byproducts'),
    detailLabel: list => count(list, 'Unhandled byproduct', 'byproducts that cannot be sunk'),
  },
  {
    type: 'outOfSync',
    severity: 'warning',
    icon: 'fas fa-times-square',
    chip: true,
    // No section: the card already carries a full sync control, so this only ever renders in the
    // sidebar, where there is nothing but a 30px tick/cross cell.
    detail: 'This factory has changed since you marked it built in game.',
    detect: factory => factory.inSync === false ? [] : null,
    label: () => 'Out of sync',
  },
  {
    type: 'redundantImport',
    severity: 'warning',
    icon: 'fas fa-arrow-to-right',
    chip: true,
    section: 'imports',
    detail: 'These parts are already covered by internal production or by another import row.',
    detect: factory => nonEmpty(subjects(
      factory.inputs.map((input, index) => isImportRedundant(index, factory) === true ? input.outputPart : null)
    )),
    label: list => count(list, 'Redundant import', 'redundant imports'),
  },
  {
    type: 'duplicateImport',
    severity: 'warning',
    icon: 'fas fa-clone',
    chip: true,
    section: 'imports',
    // The second row's amount is silently ignored, which is the surprising part.
    detail: 'These parts are imported twice from the same factory, so only one request reaches it.',
    detect: factory => nonEmpty(subjects(
      factory.inputs.map((input, index) => isDuplicateImport(factory, index) ? input.outputPart : null)
    )),
    label: list => count(list, 'Duplicate import', 'duplicate imports'),
  },
  {
    type: 'noDemand',
    severity: 'note',
    icon: 'fas fa-question-circle',
    chip: true,
    section: 'products',
    detail: 'Nothing asks for these products: no recipe here needs them and no factory imports them.',
    // Products only. A byproduct in the same state is unhandledByproduct, which is amber and says
    // something worse; naming the item in both chips would be saying it twice.
    detect: factory => {
      const byproducts = factoryByproducts(factory)
      return nonEmpty(subjects(
        factoryProducts(factory).filter(id => !byproducts.includes(id) && hasNoDemand(factory, id))
      ))
    },
    label: list => count(list, 'No demand', 'no demand'),
    detailLabel: list => count(list, 'No demand', 'products with no demand'),
  },
  {
    type: 'potentialBlockage',
    severity: 'note',
    icon: 'fas fa-exclamation-triangle',
    chip: true,
    section: 'products',
    detail: 'Nothing consumes these byproducts, so they will back up unless you sink them.',
    // The soft half of the byproduct case: sinking it is one control away, so this is a loose end
    // rather than a wall, and the factory stays green.
    detect: factory => nonEmpty(subjects(
      factoryByproducts(factory).filter(id => isPotentialBlockage(factory, id))
    )),
    label: list => count(list, 'Potential blockage', 'potential blockages'),
    detailLabel: list => count(list, 'Potential blockage', 'byproducts that need sinking'),
  },
]

// Every status that applies, highest severity first.
export const getFactoryStatuses = (factory: Factory): FactoryStatus[] =>
  factoryStatusDefinitions.flatMap(definition => {
    const found = definition.detect(factory)
    if (found === null) return []
    return [{
      type: definition.type,
      severity: definition.severity,
      icon: definition.icon,
      chip: definition.chip,
      section: definition.section,
      detail: definition.detail,
      subjects: found,
      label: definition.label(found),
      detailLabel: (definition.detailLabel ?? definition.label)(found),
    }]
  })

/**
 * The engine's entry point, kept separate from getFactoryStatuses on purpose.
 *
 * calculateHasProblem runs for every factory at the end of every factory's calculation, and the
 * engine runs per factory twice — on the order of 30,000 invocations for a 124-factory plan.
 * Evaluating the warning tier in there would drag the O(inputs²) import predicates into that loop.
 * This touches problem-tier definitions only and bails on the first hit.
 */
export const hasFactoryProblem = (factory: Factory): boolean =>
  factoryStatusDefinitions.some(
    definition => definition.severity === 'problem' && definition.detect(factory) !== null
  )

export const highestSeverity = (statuses: FactoryStatus[]): FactoryStatusSeverity | null => {
  if (statuses.some(status => status.severity === 'problem')) return 'problem'
  if (statuses.some(status => status.severity === 'warning')) return 'warning'
  return statuses.length ? 'note' : null
}

// The class object every display site binds. Exclusive by construction: at most one is true.
// The note tier is absent on purpose: it colours its chip and nothing else.
export const factoryStatusClass = (statuses: FactoryStatus[] = []) => {
  const severity = highestSeverity(statuses)
  return {
    problem: severity === 'problem',
    warning: severity === 'warning',
  }
}

export type FactoryStatusTally = Record<string, number>

/**
 * Plan-wide counts for the summary headers and the group headers: how many *factories* are in each
 * state, not how many times each state occurs. One entry per chip definition below, so a factory
 * short of two different parts counts once, and a factory that is both short and out of sync counts
 * in both.
 *
 * Takes the status lists rather than the factories: every caller already holds a memo of them, and
 * re-deriving would run the warning-tier predicates a second time over the whole plan.
 */
export const tallyFactoryStatuses = (perFactory: Iterable<FactoryStatus[]>): FactoryStatusTally => {
  const tally: FactoryStatusTally = {}
  for (const definition of tallyChipDefinitions) tally[definition.key] = 0

  for (const statuses of perFactory) {
    for (const definition of tallyChipDefinitions) {
      if (statuses.some(status => definition.types.includes(status.type))) tally[definition.key]++
    }
  }

  return tally
}

export interface FactoryStatusTallyChip {
  key: string
  count: number
  icon: string
  class: string
  // Follows the count where there is room for it ("6 shortages"); the sidebar and the band show
  // the number alone and put the tooltip's fuller wording behind a hover.
  label: string
  tooltip: string
}

interface TallyChipDefinition {
  key: string
  // The statuses that count towards this chip. More than one where several statuses are one
  // thing to the reader.
  types: FactoryStatusType[]
  icon: string
  class: string
  label: [string, string]
  sentence: [string, string]
}

// One chip per kind of trouble rather than a "problems" rollup: a count of factories with
// *something* wrong says nothing you can act on, and it double-counted every factory that was
// also listed as short. Declared problems-first, matching the registry above.
const tallyChipDefinitions: TallyChipDefinition[] = [
  {
    key: 'shortages',
    types: ['partShortage'],
    // A box, not a warning glyph: the count is about parts.
    icon: 'fas fa-box',
    class: 'status-problem',
    label: ['shortage', 'shortages'],
    sentence: ['factory is short of parts', 'factories are short of parts'],
  },
  {
    key: 'exportShortage',
    types: ['exportShortage'],
    icon: 'fas fa-truck-container',
    class: 'status-problem',
    label: ['export unmet', 'exports unmet'],
    sentence: ['factory cannot meet an export another factory asked for', 'factories cannot meet exports other factories asked for'],
  },
  {
    key: 'buildingGroups',
    types: ['buildingGroupMismatch'],
    // The same layers the Building Groups tray wears, so the chip points at what to open.
    icon: 'fas fa-layer-group',
    class: 'status-problem',
    label: ['building groups', 'building groups'],
    sentence: ['factory has building groups that do not add up', 'factories have building groups that do not add up'],
  },
  {
    key: 'unhandledByproduct',
    types: ['unhandledByproduct'],
    icon: 'fas fa-exclamation-triangle',
    class: 'status-warning',
    label: ['unhandled byproduct', 'unhandled byproducts'],
    sentence: ['factory makes a byproduct that cannot be sunk', 'factories make byproducts that cannot be sunk'],
  },
  {
    key: 'outOfSync',
    types: ['outOfSync'],
    icon: 'fas fa-times-square',
    class: 'status-warning',
    label: ['out of sync', 'out of sync'],
    sentence: ['factory is out of sync with the game', 'factories are out of sync with the game'],
  },
  {
    key: 'redundantImport',
    types: ['redundantImport'],
    icon: 'fas fa-arrow-to-right',
    class: 'status-warning',
    label: ['redundant import', 'redundant imports'],
    sentence: ['factory imports something it does not need', 'factories import something they do not need'],
  },
  {
    key: 'duplicateImport',
    types: ['duplicateImport'],
    icon: 'fas fa-clone',
    class: 'status-warning',
    label: ['duplicate import', 'duplicate imports'],
    sentence: ['factory imports the same part twice', 'factories import the same part twice'],
  },
  {
    key: 'noDemand',
    types: ['noDemand'],
    icon: 'fas fa-question-circle',
    class: 'status-note',
    label: ['no demand', 'no demand'],
    sentence: ['factory produces something nothing asks for', 'factories produce something nothing asks for'],
  },
  {
    key: 'potentialBlockage',
    types: ['potentialBlockage'],
    icon: 'fas fa-exclamation-triangle',
    class: 'status-note',
    label: ['potential blockage', 'potential blockages'],
    sentence: ['factory makes a byproduct that needs sinking', 'factories make byproducts that need sinking'],
  },
]

// Whether one factory counts towards a given tally chip — the same membership test the counting
// above does, exposed so a display site can filter by a chip it has just rendered.
export const matchesTallyChip = (statuses: FactoryStatus[], key: string): boolean => {
  const definition = tallyChipDefinitions.find(each => each.key === key)
  return !!definition && statuses.some(status => definition.types.includes(status.type))
}

// Only the states that apply. A row of zeroes on a healthy plan is noise, and it is the presence
// of a number that is supposed to mean something.
export const factoryStatusTallyChips = (tally: FactoryStatusTally): FactoryStatusTallyChip[] =>
  tallyChipDefinitions
    .filter(definition => (tally[definition.key] ?? 0) > 0)
    .map(definition => {
      const count = tally[definition.key]
      const plural = count === 1 ? 0 : 1
      return {
        key: definition.key,
        count,
        icon: definition.icon,
        class: definition.class,
        label: definition.label[plural],
        tooltip: `${count} ${definition.sentence[plural]}`,
      }
    })

export const getSectionStatuses = (statuses: FactoryStatus[], section: FactoryStatusSection): FactoryStatus[] =>
  statuses.filter(status => status.section === section)

export const getChipStatuses = (statuses: FactoryStatus[]): FactoryStatus[] =>
  statuses.filter(status => status.chip)
