import { Factory } from '@/interfaces/planner/FactoryInterface'

export const initializeCalculatorFactoryPart = (factory: Factory, part: string) => {
  if (!factory.exportCalculator[part]) {
    factory.exportCalculator[part] = {
      selected: null,
      factorySettings: {},
    }
  }
}

export const initializeCalculatorFactorySettings = (factory: Factory, part: string, factoryId: string) => {
  if (!factory.exportCalculator[part].factorySettings) {
    throw new Error('calculator: Was asked to initialize factory settings, but factory settings parent object is not defined!')
  }

  if (!factory.exportCalculator[part].factorySettings[factoryId]) {
    factory.exportCalculator[part].factorySettings[factoryId] = {
      trainTime: 123,
      droneTime: 123,
      truckTime: 123,
      tractorTime: 123,
    }
  }
}
