import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'

// Dissolved Silica is the one part the game gives no way of making on purpose: Quartz
// Purification drops it, and nothing else produces it at all. Distilled Silica burns more of it
// than one Quartz Purification supplies, so the factory is short of a part it can only ever get
// as a side effect - the case "Correct Manually" exists for.
//
// Contrast with Dark Matter Residue, which looks the same in a factory (every Quantum Encoder
// recipe drops it) but which a Converter makes outright, so it gets "+ Product" instead.
export const create545Scenario = (): { getFactories: () => Factory[] } => {
  const mockFactory = newFactory('Quartz', 0, 1)

  const factories = [mockFactory]

  // Byproduct: 60/min Dissolved Silica
  addProductToFactory(mockFactory, {
    id: 'QuartzCrystal',
    amount: 75,
    recipe: 'Alternate_Quartz_Purified',
  })
  // Consumes 120/min Dissolved Silica, leaving the factory 60/min short of it.
  addProductToFactory(mockFactory, {
    id: 'Silica',
    amount: 270,
    recipe: 'Alternate_Silica_Distilled',
  })

  return {
    getFactories: () => factories,
  }
}
