import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'

export const create267Scenario = (): { getFactories: () => Factory[] } => {
  // Local variables to ensure a fresh instance on every call
  const nuclearFac = newFactory('Nuclear', 0)

  // Store factories in an array
  const factories = [nuclearFac]

  addProductToFactory(nuclearFac, {
    id: 'PlutoniumPellet',
    amount: 30,
    recipe: 'Plutonium',
  })
  addProductToFactory(nuclearFac, {
    id: 'Ficsonium',
    amount: 10,
    recipe: 'Ficsonium',
  })

  // Return an object with a method to access the factories
  return {
    getFactories: () => factories, // Expose factories as a method
  }
}
