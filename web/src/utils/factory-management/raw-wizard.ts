/**
 * raw-wizard.ts — bulk-fixes the raw shortages left by raw resources no longer being assumed.
 *
 * One row per (factory, unmet raw part). Each row picks how to cover it: a shared mine factory,
 * extraction on the spot, an import from a factory that already mines it, or nothing.
 *
 * ATOMICITY: applyRawWizard never touches the plan it is given. It clones, mutates the clone,
 * calculates it, and hands the result back for the caller to commit in one pass. Mutating live
 * would persist through appStore.addFactory()'s schedulePersist() on every factory created, so a
 * throw halfway through would leave orphan mines in the saved plan with no way back — the app has
 * no undo. Everything that can fail happens before the caller commits anything.
 */
import { DataInterface } from '@/interfaces/DataInterface'
import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
import { NodePurity } from '@/interfaces/Recipes'
import { calculateFactories, generateFactoryId, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory, getProduct } from '@/utils/factory-management/products'
import { addInputToFactory, getAllInputs } from '@/utils/factory-management/inputs'
import { addShortageToFactory } from '@/utils/factory-management/satisfaction'
import {
  getExtractionRecipeForPart,
  isExtractionRecipe,
} from '@/utils/factory-management/building-groups/extraction'
import { getPartDisplayName } from '@/utils/helpers'

export type WizardChoice = 'mine' | 'onsite' | 'import' | 'ignore'

export interface WizardCandidate {
  id: number
  name: string
}

export interface WizardRow {
  factoryId: number
  factoryName: string
  partId: string
  partName: string
  // Captured when the table is built and applied as captured. The wizard is a modal, so the plan
  // cannot be edited underneath it; re-reading at apply time would let the summary promise one
  // number and write another. Staleness is caught by validation instead.
  shortfall: number
  choice: WizardChoice
  importFrom: number | null
  candidates: WizardCandidate[]
  // Extractable only by a resource well (Nitrogen Gas). Wells cannot be created automatically:
  // a well's rate comes from its satellites, so solving a target against a fresh one multiplies
  // the pressurizer instead and lands an order of magnitude out while reading as solved. Those
  // rows offer import or nothing, and say why.
  wellOnly: boolean
}

export interface WizardFactoryExport {
  toFactoryId: number
  toFactoryName: string
  partId: string
  partName: string
  amount: number
}

// What the run did to a line the review is showing: created it, or raised an amount that was
// already there. Null means it was already like that and the run left it alone.
export type WizardChange = 'new' | 'increased' | null

export interface WizardFactoryImport {
  fromFactoryId: number
  fromFactoryName: string
  partId: string
  partName: string
  amount: number
  change: WizardChange
}

// What a touched factory looks like once the run has been calculated — read off the result, not
// predicted from the rows, so the review shows what will actually be committed.
export interface WizardFactoryPlan {
  factoryId: number
  factoryName: string
  isNew: boolean
  products: { partId: string, partName: string, amount: number, change: WizardChange }[]
  imports: WizardFactoryImport[]
  exports: WizardFactoryExport[]
}

export interface WizardSummary {
  minesCreated: string[]
  productsAdded: number
  importsWired: number
  factories: WizardFactoryPlan[]
}

export interface WizardExtractorChoice {
  building: string
  purity: NodePurity
}

// Where the mines the wizard creates land in the plan.
export type WizardPlacement = 'top' | 'bottom'

export interface WizardApplyOptions {
  extractor?: WizardExtractorChoice
  placement?: WizardPlacement
}

// A miner one step up from the reference extractor, on an ordinary node: the middle-of-the-road
// guess. Only the building count and power change with this — never the ore.
export const DEFAULT_EXTRACTOR: WizardExtractorChoice = { building: 'minermk2', purity: 'normal' }

// Water is extracted on site far more often than it is piped across a plan, and with one mine per
// resource the alternative is a single Water factory feeding twenty others.
const ON_SITE_BY_DEFAULT = ['Water']

const hasExtractionProduct = (factory: Factory, partId: string): boolean =>
  factory.products.some(product => product.id === partId && isExtractionRecipe(product.recipe))

export const collectRawWizardRows = (factories: Factory[]): WizardRow[] => {
  const rows: WizardRow[] = []

  for (const factory of factories) {
    for (const partId of Object.keys(factory.parts)) {
      const part = factory.parts[partId]
      // Hand-gathered resources never appear: the engine leaves them satisfied.
      if (!part.isRaw || part.satisfied) {
        continue
      }

      // Only factories that actually MINE it. One that unpackages Water is not a mine, and
      // bumping its product would expand a packaging chain while the row said "import".
      const candidates = factories
        .filter(other => other.id !== factory.id && hasExtractionProduct(other, partId))
        .map(other => ({ id: other.id, name: other.name }))

      const wellOnly = !getExtractionRecipeForPart(partId)

      let choice: WizardChoice = 'mine'
      if (candidates.length > 0) {
        choice = 'import'
      } else if (wellOnly) {
        choice = 'ignore'
      } else if (ON_SITE_BY_DEFAULT.includes(partId)) {
        choice = 'onsite'
      }

      rows.push({
        factoryId: factory.id,
        factoryName: factory.name,
        partId,
        partName: getPartDisplayName(partId),
        shortfall: Math.abs(part.amountRemaining),
        choice,
        importFrom: candidates[0]?.id ?? null,
        candidates,
        wellOnly,
      })
    }
  }

  return rows
}

// What a row is allowed to be set to. Kept here rather than in the component so the rule is
// testable and the two cannot drift.
//
// A well-only resource offers nothing at all. The wizard cannot build the well, and while it could
// technically wire an import from one that already exists, offering that single option on a row
// that otherwise says "not possible" reads as though the wizard half-solved it. Those rows stay
// shortages and say so; wiring the import by hand afterwards is one click in Imports.
export const choicesForRow = (row: WizardRow): WizardChoice[] => {
  if (row.wellOnly) {
    return ['ignore']
  }

  const choices: WizardChoice[] = ['mine', 'onsite']
  if (row.candidates.length > 0) {
    choices.push('import')
  }
  choices.push('ignore')
  return choices
}

export class WizardValidationError extends Error {}

// Everything that could make a row unapplicable, checked against the plan as it stands now rather
// than as it stood when the table was read. Any failure aborts the whole apply — a partial fix is
// worse than none, because it is the half you did not check.
const validateRows = (rows: WizardRow[], factories: Factory[]) => {
  const byId = new Map(factories.map(factory => [factory.id, factory]))

  for (const row of rows) {
    if (row.choice === 'ignore') {
      continue
    }

    const factory = byId.get(row.factoryId)
    if (!factory) {
      throw new WizardValidationError(`"${row.factoryName}" is no longer in this plan.`)
    }

    const part = factory.parts[row.partId]
    if (!part) {
      throw new WizardValidationError(`"${row.factoryName}" no longer needs ${row.partName}.`)
    }

    if (!Number.isFinite(row.shortfall) || row.shortfall <= 0) {
      throw new WizardValidationError(`The shortfall for ${row.partName} in "${row.factoryName}" is not a usable amount.`)
    }

    if (Math.abs(Math.abs(part.amountRemaining) - row.shortfall) > 0.001) {
      throw new WizardValidationError(
        `"${row.factoryName}" has changed since this was opened — ${row.partName} is no longer short by ${row.shortfall}/min. Close and re-open the wizard.`
      )
    }

    if (row.choice === 'import') {
      const target = row.importFrom == null ? undefined : byId.get(row.importFrom)
      if (!target || !hasExtractionProduct(target, row.partId)) {
        throw new WizardValidationError(`The factory chosen to supply ${row.partName} to "${row.factoryName}" no longer mines it.`)
      }
    }

    if (row.choice !== 'import' && row.wellOnly) {
      throw new WizardValidationError(`${row.partName} comes from a resource well, which has to be placed by hand.`)
    }
  }
}

// Adds the extraction as a product and sizes its building group for the chosen mark and purity.
//
// The sync dance is load-bearing. addProductToFactory creates the group immediately on the
// recipe's REFERENCE extractor (Mk.1), so swapping in a Mk.2 afterwards doubles the group's output
// against an unchanged product amount — a brand new mine that is already reporting a building
// group mismatch. Turning sync on lets the amount drive the count instead; mines are then put back
// to the unsynced default so a later mark change doesn't rewrite the quantity.
const addSizedExtraction = (
  factory: Factory,
  partId: string,
  recipe: string,
  amount: number,
  extractor: WizardExtractorChoice,
): FactoryItem => {
  addProductToFactory(factory, { id: partId, recipe, amount })
  const product = factory.products[factory.products.length - 1]

  const group = product.buildingGroups[0]
  if (group) {
    group.extractorBuilding = extractor.building
    group.purity = extractor.purity
  }
  product.buildingGroupItemSync = true

  return product
}

export interface WizardApplyResult {
  factories: Factory[]
  summary: WizardSummary
}

const importKey = (consumerId: number, partId: string, supplierId: number) =>
  `${consumerId}:${partId}:${supplierId}`

// Where the factories the run created sit in the plan. Pure presentation — nothing calculated
// depends on the order — so the review can re-run it on an already-calculated result rather than
// applying the whole wizard again, which would throw away anything renamed since.
export const placeNewFactories = (
  factories: Factory[],
  newIds: Set<number>,
  placement: WizardPlacement,
): Factory[] => {
  if (!newIds.size) {
    return factories
  }

  const created = factories.filter(factory => newIds.has(factory.id))
  const rest = factories.filter(factory => !newIds.has(factory.id))
  const ordered = placement === 'top' ? [...created, ...rest] : [...rest, ...created]
  ordered.forEach((factory, index) => { factory.displayOrder = index })

  return ordered
}

// Read off the calculated plan rather than accumulated as rows are applied: a mine feeding six
// factories is one product and six exports, and only the finished dependency pass knows that.
const describeTouchedFactories = (
  factories: Factory[],
  touched: Set<number>,
  created: Set<Factory>,
  productChanges: Map<FactoryItem, WizardChange>,
  // Inputs are keyed rather than held by identity: the engine rebuilds them as it prunes and
  // rebalances, so a reference captured while applying may not be the one that survives.
  importChanges: Map<string, WizardChange>,
): WizardFactoryPlan[] => {
  const names = new Map(factories.map(factory => [factory.id, factory.name]))

  return factories
    .filter(factory => touched.has(factory.id))
    .map(factory => ({
      factoryId: factory.id,
      factoryName: factory.name,
      isNew: created.has(factory),
      products: factory.products.map(product => ({
        partId: product.id,
        partName: getPartDisplayName(product.id),
        amount: product.amount,
        change: productChanges.get(product) ?? null,
      })),
      imports: factory.inputs
        .filter(input => input.factoryId != null && input.outputPart)
        .map(input => ({
          fromFactoryId: input.factoryId!,
          fromFactoryName: names.get(input.factoryId!) ?? 'Unknown factory',
          partId: input.outputPart!,
          partName: getPartDisplayName(input.outputPart!),
          amount: input.amount,
          change: importChanges.get(importKey(factory.id, input.outputPart!, input.factoryId!)) ?? null,
        })),
      exports: Object.values(factory.dependencies.requests)
        .flat()
        .map(request => ({
          toFactoryId: request.requestingFactoryId,
          toFactoryName: names.get(request.requestingFactoryId) ?? 'Unknown factory',
          partId: request.part,
          partName: getPartDisplayName(request.part),
          amount: request.amount,
        })),
    }))
}

export const applyRawWizard = (
  factories: Factory[],
  rows: WizardRow[],
  gameData: DataInterface,
  options: WizardApplyOptions = {},
): WizardApplyResult => {
  const extractor = options.extractor ?? DEFAULT_EXTRACTOR
  const placement = options.placement ?? 'top'

  // Plain data throughout (it round-trips to localStorage already), so this is a true detached
  // copy — including through reactive proxies.
  let working = JSON.parse(JSON.stringify(factories)) as Factory[]

  validateRows(rows, working)

  const byId = new Map(working.map(factory => [factory.id, factory]))
  const summary: WizardSummary = { minesCreated: [], productsAdded: 0, importsWired: 0, factories: [] }
  const sizedProducts: FactoryItem[] = []
  const touched = new Set<number>()
  // What the review says about each line it shows. Recorded as the change is made, because
  // afterwards a raised amount is indistinguishable from one that was always that size.
  const productChanges = new Map<FactoryItem, WizardChange>()
  const importChanges = new Map<string, WizardChange>()

  // A mine's product is created by the first row that wants it and raised by every row after, so
  // "new" has to win — otherwise the second consumer relabels it as merely increased.
  const noteProduct = (product: FactoryItem, change: WizardChange) => {
    if (change === 'new' || !productChanges.has(product)) {
      productChanges.set(product, change)
    }
  }

  // One mine per resource for the whole plan, sized to everything that asked for it — not one
  // per row, which would leave a plan short of iron in eight places with eight iron mines.
  const mineRows = rows.filter(row => row.choice === 'mine')
  const mines = new Map<string, Factory>()

  for (const row of mineRows) {
    if (mines.has(row.partId)) {
      continue
    }

    // Assigned with the whole plan visible. appStore.addFactory() is the only thing that repairs
    // an ID collision, and committing in one pass means bypassing it — the dependency system keys
    // every export request by factory ID, so a collision would silently cross two factories' wires.
    const mine = newFactory(`${row.partName} Mine`, working.length, generateFactoryId(working))
    mine.displayOrder = working.length
    working.push(mine)
    byId.set(mine.id, mine)
    mines.set(row.partId, mine)
    summary.minesCreated.push(mine.name)
  }

  for (const row of rows) {
    if (row.choice === 'ignore') {
      continue
    }

    const factory = byId.get(row.factoryId)!
    const recipe = getExtractionRecipeForPart(row.partId)
    touched.add(factory.id)

    if (row.choice === 'onsite') {
      if (!recipe) {
        throw new WizardValidationError(`There is no extractor for ${row.partName}.`)
      }
      const existing = getProduct(factory, row.partId, true) as FactoryItem | undefined
      if (existing && isExtractionRecipe(existing.recipe)) {
        existing.amount += row.shortfall
        noteProduct(existing, 'increased')
      } else {
        const added = addSizedExtraction(factory, row.partId, recipe, row.shortfall, extractor)
        sizedProducts.push(added)
        noteProduct(added, 'new')
      }
      summary.productsAdded++
      continue
    }

    // 'mine' and 'import' both mean "somebody else produces it and ships it here".
    const target = row.choice === 'mine' ? mines.get(row.partId)! : byId.get(row.importFrom!)!
    touched.add(target.id)

    if (row.choice === 'mine' && !hasExtractionProduct(target, row.partId)) {
      // First row to reach this mine: place the sized product, then wire the import by hand.
      // addShortageToFactory would place an unsized one on the reference extractor.
      if (!recipe) {
        throw new WizardValidationError(`There is no extractor for ${row.partName}.`)
      }
      const added = addSizedExtraction(target, row.partId, recipe, row.shortfall, extractor)
      sizedProducts.push(added)
      noteProduct(added, 'new')
      summary.productsAdded++
      addInputToFactory(factory, { factoryId: target.id, outputPart: row.partId, amount: row.shortfall })
      importChanges.set(importKey(factory.id, row.partId, target.id), 'new')
    } else {
      // Every later row bumps the mine's product and adds its own import — or raises them, if the
      // factory already had some of either. Read before, because afterwards they look the same.
      const existingProduct = getProduct(target, row.partId, true) as FactoryItem | undefined
      const hadInput = getAllInputs(factory, row.partId, target.id).length > 0

      addShortageToFactory(factory, target, row.partId, recipe ?? '', row.shortfall)

      const product = existingProduct ?? target.products[target.products.length - 1]
      noteProduct(product, existingProduct ? 'increased' : 'new')
      importChanges.set(importKey(factory.id, row.partId, target.id), hadInput ? 'increased' : 'new')
    }
    summary.importsWired++
  }

  // A dozen new mines appended to a long plan land where they'll never be seen, so where they go
  // is the user's call.
  working = placeNewFactories(working, new Set([...mines.values()].map(mine => mine.id)), placement)

  calculateFactories(working, gameData)

  // Back to the unsynced default every mine is created with, now that the groups are sized.
  sizedProducts.forEach(product => { product.buildingGroupItemSync = false })

  summary.factories = describeTouchedFactories(
    working,
    touched,
    new Set(mines.values()),
    productChanges,
    importChanges,
  )

  return { factories: working, summary }
}
