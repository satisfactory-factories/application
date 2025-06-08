import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addInputToFactory } from '@/utils/factory-management/inputs'

export const create268Scenraio = (): { getFactories: () => Factory[] } => {
  // Local variables to ensure a fresh instance on every call
  const fuelFac = newFactory('Fuel Factory', 0)
  const fuelGensFac = newFactory('Fuel Gens', 1)

  // Store factories in an array
  const factories = [fuelFac, fuelGensFac]

  // Add products, producers, and imports
  const addProductsToFactories = () => {
    addProductToFactory(fuelFac, {
      id: 'LiquidFuel',
      amount: 100,
      recipe: 'LiquidFuel',
    })
  }

  const addPowerProducersToFactories = () => {
    addPowerProducerToFactory(fuelGensFac, {
      building: 'generatorfuel',
      ingredientAmount: 100,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Ingredient,
    })
  }

  const addImportsToFactories = () => {
    addInputToFactory(fuelGensFac, {
      factoryId: fuelFac.id,
      outputPart: 'LiquidFuel',
      amount: 100,
    })
  }

  // Execute setup functions
  addProductsToFactories()
  addPowerProducersToFactories()
  addImportsToFactories()

  // Return an object with a method to access the factories
  return {
    getFactories: () => factories, // Expose factories as a method
  }
}
