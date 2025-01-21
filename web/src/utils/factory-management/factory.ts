import { BuildingRequirement, Factory, FactoryDependency, FactoryPower } from '@/interfaces/planner/FactoryInterface'
import { calculateProducts } from '@/utils/factory-management/products'
import { calculateFactoryBuildingsAndPower } from '@/utils/factory-management/buildings'
import { calculateParts } from '@/utils/factory-management/parts'
import {
  calculateDependencies,
  calculateDependencyMetrics,
  calculateDependencyMetricsSupply,
  calculateFactoryDependencies,
} from '@/utils/factory-management/dependencies'
import { calculateHasProblem } from '@/utils/factory-management/problems'
import { DataInterface } from '@/interfaces/DataInterface'
import eventBus from '@/utils/eventBus'
import { calculateSyncState } from '@/utils/factory-management/syncState'
import { calculatePowerProducers } from '@/utils/factory-management/power'

export const findFac = (factoryId: string | number, factories: Factory[]): Factory => {
  // This should always be supplied, if not there's a major bug.
  if (!factoryId) {
    throw new Error('No factoryId provided to findFac')
  }

  // Ensure factoryId is parsed to a number to match factories array ids
  const factory = factories.find(fac => fac.id === parseInt(factoryId.toString(), 10))
  if (!factory) {
    console.error('Factory not found:', factoryId)
    return {} as Factory

    // throw new Error(`Factory ${factoryId} not found!`)
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

export const newFactory = (name = 'A new factory', order?: number, id?: number): Factory => {
  return {
    id: id ?? Math.floor(Math.random() * 10000),
    name,
    products: [],
    byProducts: [],
    powerProducers: [],
    inputs: [],
    previousInputs: [],
    parts: {},
    buildingRequirements: {} as { [p: string]: BuildingRequirement },
    dependencies: {
      requests: {},
      metrics: {},
    } as FactoryDependency,
    exportCalculator: {},
    rawResources: {},
    power: {} as FactoryPower,
    requirementsSatisfied: true, // Until we do the first calculation nothing is wrong
    usingRawResourcesOnly: false,
    hidden: false,
    hasProblem: false,
    inSync: null,
    syncState: {},
    displayOrder: order ?? -1, // this will get set by the planner
    tasks: [],
    notes: '',
    dataVersion: '2025-01-03',
    updated: new Date().toISOString(),
  }
}

// We update the factory in layers of calculations. This makes it much easier to conceptualize.
export const calculateFactory = (
  factory: Factory,
  allFactories: Factory[],
  gameData: DataInterface,
  loadMode = false,
) => {
  // Create a shallow copies of the data so we don't cause a vue reactivity storm
  const factoryCopy = toRaw(factory)
  const allFactoriesCopy = toRaw(allFactories)

  // console.log('Calculating factory:', factoryCopy.name)

  // Calculate what is produced and required by the products.
  calculateProducts(factoryCopy, gameData)

  // Calculate if there have been any changes the player needs to enact.
  calculateSyncState(factoryCopy)

  // Calculate the generation of power for the factory
  calculatePowerProducers(factoryCopy, gameData)

  // Calculate the amount of buildings and power required to make the factory and any power generation.
  calculateFactoryBuildingsAndPower(factoryCopy, gameData)

  // Calculate the dependencies for just this factory.
  calculateFactoryDependencies(factoryCopy, allFactoriesCopy, gameData, loadMode)

  // Calculate the dependency metrics for the factory.
  calculateDependencyMetrics(factoryCopy)

  // Then we calculate the satisfaction of the factory. This requires Dependencies to be calculated first.
  calculateParts(factoryCopy, gameData)

  // After now knowing what our supply is, we need to recalculate the dependency metrics.
  calculateDependencyMetricsSupply(factoryCopy)

  // Export Calculator stuff
  // configureExportCalculator(allFactories)

  // Check if the factory has any problems.
  calculateHasProblem(allFactoriesCopy)

  // Reassign the data.
  Object.assign(factory, factoryCopy)

  allFactories.forEach((factory, index) => {
    Object.assign(factory, allFactoriesCopy[index])
  })

  // Set the updated property so the UI knows when the factory was last updated.
  factory.updated = new Date().toISOString()

  console.log('Factory calculations complete:', factory.name)
}

export const calculateFactories = (factories: Factory[], gameData: DataInterface): void => {
  // Take a copy of the data to ensure we don't mutate the original data causing reactivity storm.
  const factoriesCopy = toRaw(factories)

  console.log('factory: calculateFactories', factoriesCopy)
  // We need to do this twice to ensure all the part dependency metrics are calculated, before we then check for invalid dependencies
  // loadMode flag passed here to ensure we don't nuke inputs due to no part data.
  // This generates the Part metrics for the factories, which is then used by calculateDependencies to generate the dependency metrics.
  // While we are running the calculations twice, they are very quick, <20ms even for the largest plans.
  console.log('factory: calculateFactories calculateFactory #1')
  factoriesCopy.forEach(factory => calculateFactory(factory, factoriesCopy, gameData, true))
  console.log('factory: calculateFactories calculateFactory #1 end')

  // Now calculate the dependencies for all factories, removing any invalid inputs.
  console.log('factory: calculateFactories calculateDependencies start')
  calculateDependencies(factoriesCopy, gameData)
  console.log('factory: calculateFactories calculateDependencies end')

  // Re-run the calculations after the dependencies have been calculated as some inputs may have been deleted
  console.log('factory: calculateFactories calculateFactory #2')
  factoriesCopy.forEach(factory => calculateFactory(factory, factoriesCopy, gameData))
  console.log('factory: calculateFactories calculateFactory #2')

  console.log('factory: calculateFactories done')

  // Reassign the factories to the store
  Object.assign(factories, factoriesCopy)

  // Emit an event that the data has been updated so it can be synced
  eventBus.emit('factoryUpdated')
}

export const countActiveTasks = (factory: Factory) => {
  return factory.tasks.filter(task => !task.completed).length
}

export const reorderFactory = (factory: Factory, direction: string, allFactories: Factory[]) => {
  const currentOrder = factory.displayOrder
  let targetOrder

  if (direction === 'up' && currentOrder > 1) {
    targetOrder = currentOrder - 1
  } else if (direction === 'down' && currentOrder < allFactories.length) {
    targetOrder = currentOrder + 1
  } else {
    return // Invalid move
  }

  // Find the target factory and swap display orders
  const targetFactory = allFactories.find(fac => fac.displayOrder === targetOrder)
  if (targetFactory) {
    targetFactory.displayOrder = currentOrder
    factory.displayOrder = targetOrder
  }

  regenerateSortOrders(allFactories)
}

export const regenerateSortOrders = (factories: Factory[]) => {
  // Sort the factories by their display order should they for some reason be out of sync in the object.
  factories.sort((a, b) => a.displayOrder - b.displayOrder)

  // Ensure that the display order is in the correct order numerically.
  factories.forEach((factory, index) => {
    factory.displayOrder = index + 1
  })
}
