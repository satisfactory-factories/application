import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'

// Closed-loop aluminium setup: Aluminum Scrap produces Water as a byproduct,
// which should be recycled into Alumina Solution production rather than
// demanding the full amount of Water from raw supply.
export const create243Scenario = (): { getFactories: () => Factory[] } => {
  const issueFactory = newFactory('Water recycling')

  const factories = [issueFactory]

  addProductToFactory(issueFactory, {
    id: 'AluminaSolution',
    amount: 960, // Requires 960 Bauxite and 1440 Water
    recipe: 'AluminaSolution',
    displayOrder: 0,
  })
  addProductToFactory(issueFactory, {
    id: 'AluminumScrap',
    amount: 1440, // Requires 960 Alumina Solution and 480 Coal, producing 480 Water as a byproduct
    recipe: 'AluminumScrap',
    displayOrder: 1,
  })

  return {
    getFactories: () => factories,
  }
}
