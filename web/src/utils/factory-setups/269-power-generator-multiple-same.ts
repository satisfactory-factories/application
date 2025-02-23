import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'

export const create269Scenario = (): { getFactories: () => Factory[] } => {
  // Local variables to ensure a fresh instance on every call
  const fuelFac = newFactory('Fuel Power', 0)

  // Store factories in an array
  const factories = [fuelFac]

  addPowerProducerToFactory(fuelFac, {
    building: 'generatorfuel',
    powerAmount: 1000,
    recipe: 'GeneratorFuel_LiquidFuel',
    updated: FactoryPowerChangeType.Power,
  })
  addPowerProducerToFactory(fuelFac, {
    building: 'generatorfuel',
    powerAmount: 1000,
    recipe: 'GeneratorFuel_LiquidFuel',
    updated: FactoryPowerChangeType.Power,
  })

  // Return an object with a method to access the factories
  return {
    getFactories: () => factories, // Expose factories as a method
  }
}
