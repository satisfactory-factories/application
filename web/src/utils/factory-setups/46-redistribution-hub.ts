import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'

// https://github.com/satisfactory-factories/application/issues/46
// Iron Factory -> Hub -> Reinforced Plates and Rotors. The Hub makes nothing: it imports Iron
// Plates and passes them on.
export const create46Scenario = (): { getFactories: () => Factory[] } => {
  const ironFactory = newFactory('Iron Factory', 0, 1)
  const hub = newFactory('Hub', 1, 2)
  const reinforced = newFactory('Reinforced Plates', 2, 3)

  const factories = [ironFactory, hub, reinforced]

  addProductToFactory(ironFactory, {
    id: 'IronPlate',
    amount: 120,
    recipe: 'IronPlate',
  })

  addProductToFactory(reinforced, {
    id: 'IronPlateReinforced',
    amount: 10,
    recipe: 'IronPlateReinforced',
  })

  addInputToFactory(hub, {
    factoryId: ironFactory.id,
    outputPart: 'IronPlate',
    amount: 100,
  })

  // Reinforced plates need 60 Iron Plates and 120 Screws; only the plates come from the Hub.
  addInputToFactory(reinforced, {
    factoryId: hub.id,
    outputPart: 'IronPlate',
    amount: 60,
  })

  return {
    getFactories: () => factories,
  }
}
