import { BuildingRequirement, Factory, FactoryDependency } from '@/interfaces/planner/FactoryInterface'
import { calculateInputs } from '@/utils/factory-management/inputs'
import { calculateByProducts, calculateInternalProducts, calculateProducts } from '@/utils/factory-management/products'
import { calculateBuildingRequirements, calculateBuildingsAndPower } from '@/utils/factory-management/buildings'
import { calculateRawSupply, calculateUsingRawResourcesOnly } from '@/utils/factory-management/supply'
import { calculateFactorySatisfaction } from '@/utils/factory-management/satisfaction'
import {
  calculateDependencyMetrics,
  constructDependencies,
  scanForInvalidInputs,
} from '@/utils/factory-management/dependencies'
import { calculateExports } from '@/utils/factory-management/exports'
import { configureExportCalculator } from '@/utils/factory-management/exportCalculator'
import { calculateHasProblem } from '@/utils/factory-management/problems'
import { DataInterface } from '@/interfaces/DataInterface'
import eventBus from '@/utils/eventBus'
import { calculateSyncState } from '@/utils/factory-management/syncState'

export const findFac = (factoryId: string | number, factories: Factory[]): Factory => {
  // This should always be supplied, if not there's a major bug.
  if (!factoryId) {
    throw new Error('No factoryId provided to findFac')
  }

  // Ensure factoryId is parsed to a number to match factories array ids
  const factory = factories.find(fac => fac.id === parseInt(factoryId.toString(), 10))
  if (!factory) {
    throw new Error(`Factory ${factoryId} not found!`)
  }
  return factory
}

export const findFacByName = (name: string, factories: Factory[]): Factory => {
  // This should always be supplied, if not there's a major bug.
  if (!name) {
    throw new Error(`No name provided to findFacByName`)
  }

  // Ensure factoryId is parsed to a number to match factories array ids
  const factory = factories.find(fac => fac.name === name)
  if (!factory) {
    throw new Error(`Factory ${name} not found!`)
  }
  return factory
}

export const newFactory = (name = 'A new factory'): Factory => {
  return {
    id: Math.floor(Math.random() * 10000),
    name,
    products: [],
    byProducts: [],
    internalProducts: {},
    inputs: [],
    parts: {},
    buildingRequirements: {} as { [p: string]: BuildingRequirement },
    totalPower: 0,
    dependencies: {
      requests: {},
      metrics: {},
    } as FactoryDependency,
    exportCalculator: {},
    rawResources: {},
    exports: {},
    requirementsSatisfied: true, // Until we do the first calculation nothing is wrong
    usingRawResourcesOnly: false,
    hidden: false,
    hasProblem: false,
    inSync: null,
    syncState: {},
    displayOrder: -1, // this will get set by the planner
    tasks: [],
    notes: '',
  }
}

// We update the factory in layers of calculations. This makes it much easier to conceptualize.
export const calculateFactory = (
  factory: Factory,
  allFactories: Factory[],
  gameData: DataInterface
) => {
  factory.rawResources = {}
  factory.parts = {}

  // Calculate what is inputted into the factory to be used by products.
  calculateInputs(factory)

  // Calculate what is produced and required by the products.
  calculateProducts(factory, gameData)

  // And calculate Byproducts
  calculateByProducts(factory, gameData)

  // Calculate if there have been any changes the player needs to enact.
  calculateSyncState(factory)

  // Calculate building requirements for each product based on the selected recipe and product amount.
  calculateBuildingRequirements(factory, gameData)

  // Calculate if we have products satisfied by raw resources.
  calculateRawSupply(factory, gameData)

  // Add a flag to denote if we're only using raw resources to make products.
  calculateUsingRawResourcesOnly(factory, gameData)

  // Calculate if we have any internal products that can be used to satisfy requirements.
  calculateInternalProducts(factory, gameData)

  // We then calculate the building and power demands to make the factory.
  calculateBuildingsAndPower(factory)

  // Check all other factories to see if they are affected by this factory change.
  constructDependencies(allFactories)

  // Check if we have any invalid inputs.
  scanForInvalidInputs(factory, allFactories)

  // Calculate the dependency metrics for the factory.
  allFactories.forEach(factory => {
    calculateDependencyMetrics(factory)
  })

  // Then we calculate the satisfaction of the factory. This requires Dependencies to be calculated first.
  calculateFactorySatisfaction(factory)

  // Now we know the demands set upon the factory, now properly calculate the export display data
  calculateExports(allFactories)

  // Export Calculator stuff
  configureExportCalculator(allFactories)

  // Finally, go through all factories and check if they have any problems.
  calculateHasProblem(allFactories)

  // Emit an event that the data has been updated so it can be synced
  eventBus.emit('factoryUpdated')

  return factory
}

export const calculateFactories = (factories: Factory[], gameData: DataInterface) => {
  factories.forEach(factory => {
    calculateFactory(factory, factories, gameData)
  })

  return factories
}

export const countIncompleteTasks = (factory: Factory) => {
  return factory.tasks.filter(task => !task.completed).length
}
