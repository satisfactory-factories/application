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
 * This module must stay a LEAF. `problems.ts` imports it and is itself imported by `factory.ts`, so
 * importing anything that reaches `factory.ts` closes a cycle. That is why the import predicates
 * live in `inputs-analysis.ts`.
 */
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { isDuplicateImport, isImportRedundant } from '@/utils/factory-management/inputs-analysis'
import { factoryAssumesRawInputs } from '@/utils/factory-management/parts'

export type FactoryStatusSeverity = 'problem' | 'warning'

// Element-id suffix of the card section a status points at, for navigateToFactory().
export type FactoryStatusSection = 'satisfaction' | 'imports' | 'products'

export type FactoryStatusType =
  | 'partShortage' |
  'rawShortage' |
  'exportShortage' |
  'buildingGroupMismatch' |
  'outOfSync' |
  'redundantImport' |
  'duplicateImport'

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
    detect: factory => {
      if (hasNoProducts(factory)) return null
      return nonEmpty(subjects(
        Object.keys(factory.parts).filter(part => !factory.parts[part].satisfied && !factory.parts[part].isRaw)
      ))
    },
    label: list => count(list, 'Shortage', 'shortages'),
  },
  {
    type: 'rawShortage',
    severity: 'problem',
    icon: 'fas fa-pickaxe',
    chip: true,
    section: 'satisfaction',
    detail: 'This factory needs raw resources it neither extracts nor imports, and it is not assuming they are supplied.',
    // Deliberately no hasNoProducts guard: a generator burning Coal it doesn't import is a real
    // shortage, and unlike partShortage there is no saved-plan colour to preserve — raw demand
    // counted as satisfied until the assumption could be turned off.
    detect: factory => {
      if (factoryAssumesRawInputs(factory)) return null
      return nonEmpty(subjects(
        Object.keys(factory.parts).filter(part => factory.parts[part].isRaw && !factory.parts[part].satisfied)
      ))
    },
    label: list => count(list, 'Raw shortage', 'raw shortages'),
    detailLabel: list => count(list, 'Raw shortage', 'raw resources short'),
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
    icon: 'fas fa-industry',
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
  return statuses.length ? 'warning' : null
}

// The class object every display site binds. Exclusive by construction: at most one is true.
export const factoryStatusClass = (statuses: FactoryStatus[] = []) => {
  const severity = highestSeverity(statuses)
  return {
    problem: severity === 'problem',
    warning: severity === 'warning',
  }
}

export const getSectionStatuses = (statuses: FactoryStatus[], section: FactoryStatusSection): FactoryStatus[] =>
  statuses.filter(status => status.section === section)

export const getChipStatuses = (statuses: FactoryStatus[]): FactoryStatus[] =>
  statuses.filter(status => status.chip)
