import { Factory } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'

// https://github.com/satisfactory-factories/application/issues/338
export const create338Scenario = (): { getFactories: () => Factory[] } => {
  const mockFactory = newFactory('Oil', 0, 1)
  const steelFac = newFactory('Steel', 1, 2)

  // Store factories in an array
  const factories = [mockFactory, steelFac]

  // Add products and imports
  addProductToFactory(mockFactory, {
    id: 'Plastic',
    amount: 840,
    recipe: 'Plastic',
  })
  addProductToFactory(mockFactory, {
    id: 'Rubber',
    amount: 240,
    recipe: 'Rubber',
  })
  addProductToFactory(mockFactory, {
    id: 'LiquidFuel',
    amount: 473,
    recipe: 'ResidualFuel',
  })
  addProductToFactory(mockFactory, {
    id: 'HeavyOilResidue',
    amount: 49.5,
    recipe: 'Alternate_HeavyOilResidue',
  })

  addProductToFactory(steelFac, {
    id: 'SteelPlate',
    amount: 1000,
    recipe: 'SteelBeam',
  })
  addInputToFactory(mockFactory, {
    factoryId: steelFac.id,
    outputPart: 'SteelPlate',
    amount: 100,
  })

  // Return an object with a method to access the factories
  return {
    getFactories: () => factories, // Expose factories as a method
  }
}
