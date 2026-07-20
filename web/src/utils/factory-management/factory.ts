import {
  BuildingRequirement,
  Factory,
  FactoryDependency,
  FactoryItem,
  FactoryPower,
  FactoryPowerProducer,
  ItemType,
} from '@/interfaces/planner/FactoryInterface'
import { calculateProducts } from '@/utils/factory-management/products'
import { calculateFactoryBuildingsAndPower, calculateFinalBuildingsAndPower } from '@/utils/factory-management/buildings'
import { calculateParts } from '@/utils/factory-management/parts'
import {
  calculateAllDependencies,
  calculateDependencyMetrics,
  calculateDependencyMetricsSupply,
  calculateFactoryDependencies,
  flushInvalidRequests,
} from '@/utils/factory-management/dependencies'
import { calculateHasProblem } from '@/utils/factory-management/problems'
import { DataInterface } from '@/interfaces/DataInterface'
import eventBus from '@/utils/eventBus'
import { calculateSyncState } from '@/utils/factory-management/syncState'
import { calculateGridBoost, calculatePowerProducers } from '@/utils/factory-management/power'
import { calculateRemainingBuildingCount, checkForItemUpdate, syncBuildingGroups } from '@/utils/factory-management/building-groups/common'

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
    syncStatePower: {},
    displayOrder: order ?? -1, // this will get set by the planner
    tasks: [],
    notes: '',
    dataVersion: '2025-01-03',
  }
}

export interface CalculationModes {
  loadMode?: boolean
  useBuildingGroupBuildings?: boolean
  forceRebalance?: boolean
  // 'recalculate' treats building groups as sacrosanct: they are never rebalanced, and
  // item quantities are adjusted to match the groups instead. Used by the Recalculate
  // action and plan loading.
  origin?: 'buildingGroup' | 'item' | 'recalculate'
  // Internal: set when calculateFactory re-runs itself after a building-group
  // sync changed item amounts, to prevent further recursion.
  groupResync?: boolean
}

// We update the factory in layers of calculations. This makes it much easier to conceptualize.
export const calculateFactory = (
  factory: Factory,
  allFactories: Factory[],
  gameData: DataInterface,
  modes: CalculationModes = {},
): Factory => {
  // Scan for invalid inputs as the user may have changed an input's factoryID.
  // Yes we are running this multiple times especially from calculateFactories,
  // but it's a very quick operation, and it ensures integrity.
  flushInvalidRequests(allFactories, gameData)

  factory.rawResources = {}
  factory.parts = {}

  // Calculate what is produced and required by the products.
  calculateProducts(factory, gameData)

  // Calculate if there have been any changes the player needs to enact.
  calculateSyncState(factory)

  // Calculate the generation of power for the factory
  calculatePowerProducers(factory, gameData)

  // Calculate the amount of buildings and power required to make the factory and any power generation.
  calculateFactoryBuildingsAndPower(factory, gameData)

  // Calculate the dependencies for just this factory.
  calculateFactoryDependencies(factory, allFactories, gameData, modes.loadMode)

  // Calculate the dependency metrics for the factory.
  calculateDependencyMetrics(factory)

  // Then we calculate the satisfaction of the factory. This requires Dependencies to be calculated first.
  calculateParts(factory, gameData)

  // After now knowing what our supply is, we need to recalculate the dependency metrics.
  calculateDependencyMetricsSupply(factory)

  // Calculate / synchronize the factory building groups.
  // ONLY rebalance though if the origin point is from the product itself, not the building groups.
  // This has a hard dependency on calculateFactoryBuildingsAndPower as it uses the building amounts per product.
  // Only write group totals back up to the item when the edit actually originated
  // from a building group. Doing it on every recalc replaces the user's exact item
  // amounts with float-degraded recomputations (e.g. 123 -> 122.999...) and stomps
  // the power producer's `updated` direction.
  const preSyncAmounts = JSON.stringify([
    factory.products.map(product => product.amount),
    factory.powerProducers.map(producer => [producer.buildingAmount, producer.powerAmount, producer.fuelAmount]),
  ])
  // On a recalculation, building groups are sacrosanct: any item that disagrees with its
  // groups has its quantity adjusted to match them, never the other way around. The 0.1
  // tolerance stops in-sync items being rewritten with float-degraded amounts.
  const shouldSyncItemToGroups = (item: FactoryItem | FactoryPowerProducer, type: ItemType): boolean => {
    if (modes.origin === 'buildingGroup') {
      return true
    }
    if (modes.origin === 'recalculate') {
      return Math.abs(calculateRemainingBuildingCount(item, type)) > 0.1
    }
    return false
  }
  factory.products.forEach(product => {
    syncBuildingGroups(product, ItemType.Product, factory, modes)
    if (shouldSyncItemToGroups(product, ItemType.Product)) {
      checkForItemUpdate(product, factory)
    }
  })
  factory.powerProducers.forEach(producer => {
    syncBuildingGroups(producer, ItemType.Power, factory, modes)
    if (shouldSyncItemToGroups(producer, ItemType.Power)) {
      checkForItemUpdate(producer, factory)
    }
  })

  // The group sync above can write new amounts back onto the items (e.g. editing
  // a group's building count updates the product's amount). Every pass before
  // this point ran against the old amounts, so requirements, parts and power are
  // now stale. Re-run the calculation once so the factory is self-consistent;
  // groupResync guards against further recursion.
  const postSyncAmounts = JSON.stringify([
    factory.products.map(product => product.amount),
    factory.powerProducers.map(producer => [producer.buildingAmount, producer.powerAmount, producer.fuelAmount]),
  ])
  if ((modes.origin === 'buildingGroup' || modes.origin === 'recalculate') && !modes.groupResync && preSyncAmounts !== postSyncAmounts) {
    return calculateFactory(factory, allFactories, gameData, { ...modes, groupResync: true })
  }

  // It's possible that the power producers have changed, so we need to recalculate the power.
  calculatePowerProducers(factory, gameData)

  calculateFinalBuildingsAndPower(factory)

  // Alien Power Augmenters boost the whole grid, so their MW contribution depends on
  // every factory's generation — recompute the plan-wide boost now totals are known.
  calculateGridBoost(allFactories, gameData)

  // Check if the factory has any problems
  allFactories.forEach(fac => {
    calculateHasProblem(fac)
  })

  // Emit an event that the data has been updated so it can be synced
  eventBus.emit('factoryUpdated', factory)

  console.log(`factory: calculateFactory completed for factory: ${factory.name}`)

  return factory
}

// The beating heart of the entire app...
// This function is called to calculate all factories in the planner.
export const calculateFactories = (
  factories: Factory[],
  gameData: DataInterface,
  modes: CalculationModes = {}
): void => {
  console.log('factory: Calculating factories', factories)
  // We need to do this twice to ensure all the part dependency metrics are calculated, before we then check for invalid dependencies
  // loadMode flag passed here to ensure we don't nuke inputs due to no part data.
  // This generates the Part metrics for the factories, which is then used by calculateDependencies to generate the dependency metrics.
  // While we are running the calculations twice, they are very quick, <20ms even for the largest plans.
  factories.forEach(factory => calculateFactory(factory, factories, gameData, { ...modes, loadMode: true }))

  // Now calculate the dependencies for all factories, removing any invalid inputs.
  calculateAllDependencies(factories, gameData)

  // Re-run the calculations after the dependencies have been calculated as some inputs may have been deleted
  factories.forEach(factory => calculateFactory(factory, factories, gameData, modes))

  console.log('factory: Calculations completed')

  eventBus.emit('calculationsCompleted')
}

export const countActiveTasks = (factory: Factory) => {
  return factory.tasks.filter(task => !task.completed).length
}

export const reorderFactory = (factory: Factory, direction: string, allFactories: Factory[]) => {
  const currentOrder = factory.displayOrder
  let targetOrder

  if (direction === 'up' && currentOrder > 0) {
    targetOrder = currentOrder - 1
  } else if (direction === 'down' && currentOrder < allFactories.length - 1) {
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
    factory.displayOrder = index
  })
}
