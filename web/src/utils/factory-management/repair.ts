import { Factory } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import {
  getBuildingDisplayName,
  getPartDisplayNameWithoutDataStore,
  getPowerRecipe,
  getRecipe,
  hasFractionalClock,
} from '@/utils/factory-management/common'
import { snapDriftedInteger } from '@/utils/numberFormatter'
import type { EventReason } from 'common'

// Plans saved before #485 hold quantities a rounding hair off the number they mean —
// 2400.002 Rocket Fuel/min for 2400. Fixing the game data corrects everything the planner
// recalculates, but a plan's *seed* values (what the user asked for) are inputs to that
// calculation, not outputs, so they carry the drift forward forever. This pass repairs them
// on load, and is deliberately blanket: any seed a whole part per million off an integer is
// snapped, whatever put it there.
//
// A user-dialled fractional clock (223.333%) is deliberate precision — 535.999 means
// 535.999 — so items carrying one are left entirely alone, matching calculateProducts.

// A quantity that was a rounding hair off the number it meant.
export interface PlanRepairEntry {
  kind: 'quantity'
  factoryName: string
  // Friendly name of the thing repaired — a part ("Rocket Fuel") or a building
  // ("Fuel-Powered Generator").
  itemName: string
  // Recipe display name, or where an import comes from.
  context: string
  // Which quantity moved, for when one item has more than one repaired figure.
  field: string
  before: number
  after: number
}

// Anything structural the loader had to put right: a broken import/export link, two
// factories sharing an ID, an import of something that isn't made any more.
export interface StructuralRepair {
  kind: 'structural'
  factoryName: string
  // What was corrected, phrased for someone who has never read the code.
  summary: string
  // The same fact as `summary`, as something a metric can count. Carried here rather than
  // mapped at the call sites so the dialog and the counter can never drift apart.
  reason: EventReason
}

// Every automatic correction made to a loaded plan, whatever found it. They are collected
// into one list and reported in one dialog so the user sees the whole picture at once.
export type PlanRepair = PlanRepairEntry | StructuralRepair

export interface PlanRepairReport {
  repairs: PlanRepairEntry[]
  // Stale mwPerItem figures refreshed from the current game data.
  staleRecipeFigures: number
}

const isDrifted = (value: number): boolean =>
  typeof value === 'number' && isFinite(value) && snapDriftedInteger(value) !== value

export const repairPlanPrecision = (
  factories: Factory[],
  gameData: DataInterface,
): PlanRepairReport => {
  const report: PlanRepairReport = { repairs: [], staleRecipeFigures: 0 }

  // An input's amount is a seed too, but it mirrors a quantity from the factory supplying
  // it — so it inherits that factory's deliberate precision, not its own.
  const factoriesWithFractionalClocks = new Set<number>()
  factories.forEach(factory => {
    const anyFractional = [...factory.products, ...factory.powerProducers]
      .some(item => hasFractionalClock(item.buildingGroups))
    if (anyFractional) {
      factoriesWithFractionalClocks.add(factory.id)
    }
  })

  const factoryNames = new Map(factories.map(factory => [factory.id, factory.name]))

  // A power producer's fuelAmount and its fuel ingredient's perMin are the same number held
  // twice, so a single drift would otherwise be reported as two identical-looking lines.
  const reported = new Set<string>()

  factories.forEach(factory => {
    const repair = (
      value: number,
      entry: Omit<PlanRepairEntry, 'kind' | 'factoryName' | 'before' | 'after'>,
    ): number => {
      if (!isDrifted(value)) return value

      const after = snapDriftedInteger(value)
      const key = `${factory.id}|${entry.itemName}|${entry.context}|${value}|${after}`
      if (!reported.has(key)) {
        reported.add(key)
        report.repairs.push({ ...entry, kind: 'quantity', factoryName: factory.name, before: value, after })
      }
      return after
    }

    factory.products.forEach(product => {
      if (hasFractionalClock(product.buildingGroups)) return

      product.amount = repair(product.amount, {
        itemName: getPartDisplayNameWithoutDataStore(product.id, gameData),
        context: getRecipe(product.recipe, gameData)?.displayName ?? product.recipe,
        field: 'Quantity',
      })
    })

    factory.powerProducers.forEach(producer => {
      if (hasFractionalClock(producer.buildingGroups)) return

      const recipe = getPowerRecipe(producer.recipe, gameData)
      const context = recipe?.displayName ?? producer.recipe
      const buildingName = getBuildingDisplayName(producer.building)
      const fuelName = producer.ingredients[0]
        ? getPartDisplayNameWithoutDataStore(producer.ingredients[0].part, gameData)
        : buildingName

      producer.fuelAmount = repair(producer.fuelAmount, {
        itemName: fuelName, context, field: 'Fuel rate',
      })
      producer.powerAmount = repair(producer.powerAmount, {
        itemName: buildingName, context, field: 'Power generated (MW)',
      })
      producer.buildingAmount = repair(producer.buildingAmount, {
        itemName: buildingName, context, field: 'Building count',
      })
      producer.ingredients.forEach(ingredient => {
        ingredient.perMin = repair(ingredient.perMin, {
          itemName: getPartDisplayNameWithoutDataStore(ingredient.part, gameData),
          context,
          field: 'Rate per min',
        })
      })
    })

    factory.inputs.forEach(input => {
      if (input.factoryId !== null && factoriesWithFractionalClocks.has(input.factoryId)) return

      const source = input.factoryId === null ? null : factoryNames.get(input.factoryId)
      input.amount = repair(input.amount, {
        itemName: input.outputPart
          ? getPartDisplayNameWithoutDataStore(input.outputPart, gameData)
          : 'Unknown part',
        context: source ? `Imported from ${source}` : 'Import',
        field: 'Quantity',
      })
    })

    // A producer's ingredients are a copy of the recipe's, taken when the producer was
    // created and never refreshed — so a save made before the game data was corrected
    // still carries the old mwPerItem. Nothing reads it today (the calculation always goes
    // to the live recipe), but leaving known-wrong figures in the save is how this bug
    // would quietly come back the day something does.
    factory.powerProducers.forEach(producer => {
      const recipe = getPowerRecipe(producer.recipe, gameData)
      if (!recipe) return

      producer.ingredients.forEach(ingredient => {
        const current = recipe.ingredients.find(candidate => candidate.part === ingredient.part)
        if (!current || current.mwPerItem === undefined) return
        if (ingredient.mwPerItem === current.mwPerItem) return

        ingredient.mwPerItem = current.mwPerItem
        report.staleRecipeFigures++
      })
    })
  })

  return report
}
