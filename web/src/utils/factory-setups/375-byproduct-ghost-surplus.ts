import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'

// https://github.com/satisfactory-factories/application/issues/375
export const create375Scenario = (): { getFactories: () => Factory[] } => {
  const factory = newFactory('Byproduct product', 0, 1)

  // Store factories in an array
  const factories = [factory]

  // Add products and imports
  addProductToFactory(factory, {
    id: 'HeavyOilResidue',
    amount: 100,
    recipe: 'Rubber',
  })
  // Return an object with a method to access the factories
  return {
    getFactories: () => factories, // Expose factories as a method
  }
}
