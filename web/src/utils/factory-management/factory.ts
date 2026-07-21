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
import { applyDiff } from '@/utils/factory-management/commit'
import { toRaw } from 'vue'

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
// This is the raw engine: it mutates whatever objects it is handed, rebuilding parts /
// metrics dictionaries from scratch each run. The exported calculateFactory wraps it in a
// clone-run-commit cycle so those churny writes never hit reactive state directly.
const calculateFactoryEngine = (
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
    return calculateFactoryEngine(factory, allFactories, gameData, { ...modes, groupResync: true })
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

  // Emit an event that the data has been updated so it can be synced.
  // During a clone run the wrapper emits after committing, with the real objects.
  if (!inCloneRun()) {
    eventBus.emit('factoryUpdated', factory)
  }

  console.log(`factory: calculateFactory completed for factory: ${factory.name}`)

  return factory
}

// The beating heart of the entire app...
// This function is called to calculate all factories in the planner.
const calculateFactoriesEngine = (
  factories: Factory[],
  gameData: DataInterface,
  modes: CalculationModes = {}
): void => {
  console.log('factory: Calculating factories', factories)
  // We need to do this twice to ensure all the part dependency metrics are calculated, before we then check for invalid dependencies
  // loadMode flag passed here to ensure we don't nuke inputs due to no part data.
  // This generates the Part metrics for the factories, which is then used by calculateDependencies to generate the dependency metrics.
  // While we are running the calculations twice, they are very quick, <20ms even for the largest plans.
  factories.forEach(factory => calculateFactoryEngine(factory, factories, gameData, { ...modes, loadMode: true }))

  // Now calculate the dependencies for all factories, removing any invalid inputs.
  calculateAllDependencies(factories, gameData)

  // Re-run the calculations after the dependencies have been calculated as some inputs may have been deleted
  factories.forEach(factory => calculateFactoryEngine(factory, factories, gameData, modes))

  console.log('factory: Calculations completed')

  if (!inCloneRun()) {
    eventBus.emit('calculationsCompleted')
  }
}

// --- Clone-run-commit wrappers ---------------------------------------------------------
// The engine rebuilds parts / metrics / rawResources from scratch and accumulates values
// with += on every pass, so run directly against reactive store objects it performs
// thousands of writes per recalculation of which ~98% leave the value unchanged. Every
// one still triggers deep watchers (localStorage persistence, the factory list, and —
// catastrophically — Vue Devtools' sync $subscribe) and re-renders every component
// reading the rebuilt objects. The public entry points below therefore run the engine on
// a plain structuredClone of the plan and diff-commit only the genuine changes back onto
// the live objects, preserving object identity throughout.

let cloneRunDepth = 0

// True while the engine is running against a calculation clone. Nested calculateFactory /
// calculateFactories calls from inside the engine (e.g. deleteRequestPair) are already
// operating on the clone and must run the engine directly rather than re-cloning.
const inCloneRun = () => cloneRunDepth > 0

const cloneForCalculation = (factories: Factory[]): Factory[] =>
  // toRaw both the array and its elements: callers hand us either the store's reactive
  // array (raw elements inside) or a plain array that may contain reactive proxies.
  structuredClone(toRaw(factories).map(factory => toRaw(factory)))

// Diff the calculation results onto the live factories; returns the ones that changed.
const commitResults = (targets: Factory[], results: Factory[]): Factory[] => {
  const changed: Factory[] = []
  targets.forEach((target, index) => {
    // Older sessions aliased previousInputs to the inputs array (they were the same
    // array object). An in-place diff of one would corrupt the other, so break the
    // alias first. setFactories no longer creates such aliases.
    if (target.previousInputs === target.inputs) {
      target.previousInputs = target.inputs.map(input => ({ ...input }))
    }
    if (applyDiff(target, results[index]) > 0) {
      changed.push(target)
    }
  })
  return changed
}

export const calculateFactory = (
  factory: Factory,
  allFactories: Factory[],
  gameData: DataInterface,
  modes: CalculationModes = {},
): Factory => {
  if (inCloneRun()) {
    return calculateFactoryEngine(factory, allFactories, gameData, modes)
  }

  const index = allFactories.indexOf(factory)
  if (index === -1) {
    // The factory isn't part of the plan being calculated (should not happen via the UI);
    // fall back to calculating it directly.
    console.error('factory: calculateFactory: factory not found in allFactories, calculating directly', factory.id)
    return calculateFactoryEngine(factory, allFactories, gameData, modes)
  }

  const results = cloneForCalculation(allFactories)
  cloneRunDepth++
  try {
    calculateFactoryEngine(results[index], results, gameData, modes)
  } finally {
    cloneRunDepth--
  }

  const changed = commitResults(allFactories, results)
  changed.forEach(fac => eventBus.emit('factoryUpdated', fac))
  // The edited factory's user-made change (e.g. a new product amount) happened before
  // this call, so the diff may be empty even though the plan is dirty — always notify.
  if (!changed.includes(factory)) {
    eventBus.emit('factoryUpdated', factory)
  }

  return factory
}

export const calculateFactories = (
  factories: Factory[],
  gameData: DataInterface,
  modes: CalculationModes = {}
): void => {
  if (inCloneRun()) {
    return calculateFactoriesEngine(factories, gameData, modes)
  }

  const results = cloneForCalculation(factories)
  cloneRunDepth++
  try {
    calculateFactoriesEngine(results, gameData, modes)
  } finally {
    cloneRunDepth--
  }

  const changed = commitResults(factories, results)
  changed.forEach(fac => eventBus.emit('factoryUpdated', fac))
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
