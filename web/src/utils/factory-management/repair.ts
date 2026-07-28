import { Factory } from '@/interfaces/planner/FactoryInterface'
import { DataInterface } from '@/interfaces/DataInterface'
import { getPowerRecipe, hasFractionalClock } from '@/utils/factory-management/common'
import { snapDriftedInteger } from '@/utils/numberFormatter'

// Plans saved before #485 hold quantities a rounding hair off the number they mean —
// 2400.002 Rocket Fuel/min for 2400. Fixing the game data corrects everything the planner
// recalculates, but a plan's *seed* values (what the user asked for) are inputs to that
// calculation, not outputs, so they carry the drift forward forever. This pass repairs them
// on load, and is deliberately blanket: any seed a whole part per million off an integer is
// snapped, whatever put it there.
//
// A user-dialled fractional clock (223.333%) is deliberate precision — 535.999 means
// 535.999 — so items carrying one are left entirely alone, matching calculateProducts.

export interface PlanRepairReport {
  // Human-readable "factory / field: before -> after" lines, for the console.
  repairs: string[]
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

  factories.forEach(factory => {
    const repair = (label: string, value: number): number => {
      if (!isDrifted(value)) return value

      const snapped = snapDriftedInteger(value)
      report.repairs.push(`${factory.name} / ${label}: ${value} -> ${snapped}`)
      return snapped
    }

    factory.products.forEach(product => {
      if (hasFractionalClock(product.buildingGroups)) return
      product.amount = repair(`product ${product.id}`, product.amount)
    })

    factory.powerProducers.forEach(producer => {
      if (hasFractionalClock(producer.buildingGroups)) return

      producer.fuelAmount = repair(`${producer.recipe} fuel`, producer.fuelAmount)
      producer.powerAmount = repair(`${producer.recipe} power`, producer.powerAmount)
      producer.buildingAmount = repair(`${producer.recipe} buildings`, producer.buildingAmount)
      producer.ingredients.forEach(ingredient => {
        ingredient.perMin = repair(`${producer.recipe} ${ingredient.part}`, ingredient.perMin)
      })
    })

    factory.inputs.forEach((input, index) => {
      if (input.factoryId !== null && factoriesWithFractionalClocks.has(input.factoryId)) return
      input.amount = repair(`input ${index} (${input.outputPart})`, input.amount)
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
