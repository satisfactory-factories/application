import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'

/**
 * The three versions of one small plan the dev-only offline conflict demo stages: what
 * both sides last agreed on, what the demo pretends the room moved on to, and what this
 * device did while it was away. Every recipe here is fed by raw resources alone, so no
 * version of the plan carries a shortage the dialog would have to be read past.
 *
 * Between them the four factories cover every row shape the dialog can draw.
 */

export const DEMO_SMELTING = 1
export const DEMO_COPPER = 2
export const DEMO_CASTING = 3
export const DEMO_STEEL = 4

/** The ids the demo claims were edited on this device. */
export const DEMO_TOUCHED = [DEMO_SMELTING, DEMO_COPPER, DEMO_CASTING, DEMO_STEEL]

/** Read back by the "other changes in this factory as well" line. */
export const DEMO_LIVE_NOTE = 'Swapped the smelters onto the pure line while you were away.'

export interface OfflineConflictDemoPlans {
  /** The last state both versions agreed on. */
  baseline: Factory[]
  /** The plan the demo pretends the room holds now. */
  live: Factory[]
  /** The plan this device has, and the one the demo tab is seeded with. */
  mine: Factory[]
}

interface Variant {
  /** Iron Smelting's rate: the plain "you asked for a different number" row. */
  ironIngots: number
  /** Copper Smelting's recipe and notes: the recipe row and the other-changes line. */
  copperRecipe: string
  copperNotes: string
  /** Concrete Casting's rate, or null where that version does not hold the factory. */
  cement: number | null
  /** Steel Smelting's rate, or null where that version does not hold the factory. */
  steelIngots: number | null
}

const build = (variant: Variant): Factory[] => {
  const smelting = newFactory('Iron Smelting', 0, DEMO_SMELTING)
  addProductToFactory(smelting, { id: 'IronIngot', amount: variant.ironIngots, recipe: 'IngotIron' })

  const copper = newFactory('Copper Smelting', 1, DEMO_COPPER)
  copper.notes = variant.copperNotes
  addProductToFactory(copper, { id: 'CopperIngot', amount: 60, recipe: variant.copperRecipe })

  const factories = [smelting, copper]

  if (variant.cement !== null) {
    const casting = newFactory('Concrete Casting', 2, DEMO_CASTING)
    addProductToFactory(casting, { id: 'Cement', amount: variant.cement, recipe: 'Concrete' })
    factories.push(casting)
  }

  if (variant.steelIngots !== null) {
    const steel = newFactory('Steel Smelting', 3, DEMO_STEEL)
    addProductToFactory(steel, { id: 'SteelIngot', amount: variant.steelIngots, recipe: 'IngotSteel' })
    factories.push(steel)
  }

  return factories
}

export const offlineConflictDemoPlans = (): OfflineConflictDemoPlans => ({
  baseline: build({
    ironIngots: 90,
    copperRecipe: 'IngotCopper',
    copperNotes: '',
    cement: 30,
    steelIngots: 40,
  }),
  // Iron rate moved, copper picked up a note, the casting factory was deleted and the
  // steel one was edited — all of it by somebody else.
  live: build({
    ironIngots: 120,
    copperRecipe: 'IngotCopper',
    copperNotes: DEMO_LIVE_NOTE,
    cement: null,
    steelIngots: 80,
  }),
  // The same iron rate moved differently here, copper was put on the alternate recipe at
  // the same rate, the casting factory was scaled up and the steel one removed.
  mine: build({
    ironIngots: 100,
    copperRecipe: 'Alternate_PureCopperIngot',
    copperNotes: '',
    cement: 45,
    steelIngots: null,
  }),
})
