// A plan carrying every kind of import/export corruption the loader has to repair, in the
// shape a real save would hold it: built and calculated correctly first, then damaged, so
// its derived figures still look current and nothing would otherwise recalculate it.
//
// Each fault is one the planner has actually produced at some point — colliding random
// factory IDs, a copied factory inheriting the original's exports, imports the supplier was
// never told about.
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { gameData } from '@/utils/gameData'

export const create499BrokenChainPlan = (): Factory[] => {
  const ingots = newFactory('Iron Ingots', 0, 1000)
  const copper = newFactory('Copper Ingots', 1, 3000)
  const plates = newFactory('Iron Plates', 2, 2000)
  const rods = newFactory('Iron Rods', 3, 4000)

  addProductToFactory(ingots, { id: 'IronIngot', amount: 1000, recipe: 'IngotIron' })
  addProductToFactory(copper, { id: 'CopperIngot', amount: 500, recipe: 'IngotCopper' })
  addProductToFactory(plates, { id: 'IronPlate', amount: 300, recipe: 'IronPlate' })
  addProductToFactory(rods, { id: 'IronRod', amount: 300, recipe: 'IronRod' })

  addInputToFactory(plates, { factoryId: ingots.id, outputPart: 'IronIngot', amount: 450 })
  addInputToFactory(rods, { factoryId: ingots.id, outputPart: 'IronIngot', amount: 300 })

  const factories = [ingots, copper, plates, rods]
  calculateFactories(factories, gameData)

  // --- Now break it, one fault at a time. ---

  // A copy of a supplying factory: Planner.vue used to clone the original's exports along
  // with everything else, so the copy claims to supply factories that buy from the original.
  const clone: Factory = {
    ...structuredClone(ingots),
    id: 5000,
    name: 'Iron Ingots (copy)',
    displayOrder: 4,
  }
  factories.push(clone)

  // Two factories issued the same random ID. Requests are keyed by ID, so from here on the
  // plan cannot tell the two apart.
  rods.id = plates.id

  // A ghost export: nothing imports Copper Ingots at all.
  copper.dependencies.requests[plates.id] = [{
    requestingFactoryId: plates.id,
    part: 'CopperIngot',
    amount: 120,
  }]

  // An export whose amount has drifted away from what the importer actually asks for.
  ingots.dependencies.requests[plates.id][0].amount = 999

  // The same part imported from the same factory on two rows.
  plates.inputs.push({ factoryId: ingots.id, outputPart: 'IronIngot', amount: 150 })

  // An import of something the supplying factory has no record of providing.
  rods.inputs.push({ factoryId: copper.id, outputPart: 'CopperIngot', amount: 60 })

  // An import from a factory that has since been deleted.
  plates.inputs.push({ factoryId: 8888, outputPart: 'IronIngot', amount: 40 })

  // A factory importing from itself.
  copper.inputs.push({ factoryId: copper.id, outputPart: 'CopperIngot', amount: 25 })

  // An export entry emptied of its requests, which still renders as an export.
  ingots.dependencies.requests[9999] = []

  return factories
}
