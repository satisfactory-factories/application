// Utilities
import { defineStore } from 'pinia'
import { Factory, FactoryPower, FactoryTab, GroupType } from '@/interfaces/planner/FactoryInterface'
import { ref, watch } from 'vue'
import { calculateFactories, regenerateSortOrders } from '@/utils/factory-management/factory'
import { useGameDataStore } from '@/stores/game-data-store'
import { validateFactories } from '@/utils/factory-management/validation'
import eventBus from '@/utils/eventBus'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { addProductBuildingGroup } from '@/utils/factory-management/building-groups/product'
import {
  calculateBuildingGroupParts,
  calculateProductBuildingGroupPower,
  rebalanceBuildingGroups,
} from '@/utils/factory-management/building-groups/common'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'

export const useAppStore = defineStore('app', () => {
  const gameDataStore = useGameDataStore()
  const gameData = gameDataStore.getGameData()

  const inited = ref(false)
  let loadedCount = 0
  const factoryTabs = ref<FactoryTab[]>(JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as FactoryTab[])

  if (factoryTabs.value.length === 0) {
    factoryTabs.value = [
      {
        id: crypto.randomUUID(),
        name: 'Default',
        // Fill the tabs from the legacy factories array if present so no data gets lost
        factories: JSON.parse(localStorage.getItem('factories') ?? '[]'),
      },
    ]
  }

  console.log('appStore: factoryTabs', factoryTabs.value)

  const currentFactoryTabIndex = ref<number>(parseInt(localStorage.getItem('currentFactoryTabIndex') ?? '0'))

  console.log('appStore: factoryTabs', currentFactoryTabIndex.value)

  // Ensure the tab index actually exists
  if (currentFactoryTabIndex.value >= factoryTabs.value.length) {
    if (!factoryTabs.value[0]) {
      // User is screwed, blow the tabs away and make a new one
      factoryTabs.value = [
        {
          id: crypto.randomUUID(),
          name: 'SAFE MODE!',
          factories: [],
        },
      ]
    }
    currentFactoryTabIndex.value = 0
    localStorage.setItem('currentFactoryTabIndex', currentFactoryTabIndex.value.toString())
    alert('Your planner has been reverted to SAFE MODE. This is because your factory tab data was heavily corrupted. You are recommended to log into your account and force download the previously saved tabs. If you have not done this, the data has been lost, unless you have copied it to a file.')
  }

  const currentFactoryTab = ref(factoryTabs.value[currentFactoryTabIndex.value])

  const factories = computed({
    get () {
      if (!currentFactoryTab?.value) {
        console.error('appStore: factories.get: No current factory tab set!')
        return []
      }
      // Ensure that the factories are initialized before returning them on the first request
      if (!inited.value) {
        console.log('appStore: factories.get: Factories not inited, initializing')
        initFactories(currentFactoryTab.value.factories)
      }
      return currentFactoryTab.value.factories
    },
    set (value) {
      currentFactoryTab.value.factories = value
    },
  })

  const lastSave = ref<Date>(new Date(localStorage.getItem('lastSave') ?? ''))
  const lastEdit = ref<Date>(new Date(localStorage.getItem('lastEdit') ?? ''))
  const isDebugMode = ref<boolean>(false)
  const isLoaded = ref<boolean>(false)
  const showSatisfactionBreakdowns = ref<boolean>(
    (localStorage.getItem('showSatisfactionBreakdowns') ?? 'false') === 'true'
  )

  const shownFactories = (factories: Factory[]) => {
    return factories.filter(factory => !factory.hidden).length
  }

  // Watch the tab index, if it changes we need to throw up a loading
  watch(currentFactoryTabIndex, () => {
    requestAnimationFrame(() => {
      console.log('appStore: currentFactoryTabIndex watcher: Tab index changed, starting load.')
      currentFactoryTab.value = factoryTabs.value[currentFactoryTabIndex.value]

      // Update localstorage with the tab index
      localStorage.setItem('currentFactoryTabIndex', currentFactoryTabIndex.value.toString())

      prepareLoader(currentFactoryTab.value.factories)
    })
  })

  // Watch the factories array for changes
  watch(factoryTabs.value, () => {
    localStorage.setItem('factoryTabs', JSON.stringify(factoryTabs.value))
    setLastEdit() // Update last edit time whenever the data changes, from any source.
  }, { deep: true })

  const getLastEdit = (): Date => {
    return lastEdit.value
  }

  const setLastEdit = () => {
    lastEdit.value = new Date()
    localStorage.setItem('lastEdit', lastEdit.value.toISOString())
  }
  const setLastSave = () => {
    lastSave.value = new Date()
    localStorage.setItem('lastSave', lastSave.value.toISOString())
  }

  const prepareLoader = async (newFactories?: Factory[], forceRecalc = false) => {
    isLoaded.value = false
    const factoriesToLoad = newFactories ?? factories.value
    console.log('appStore: prepareLoader', factoriesToLoad)

    // Tell planner to hide to remove all rendered content
    eventBus.emit('plannerShow', false)

    // Wait a bit for the planner to comply
    await new Promise(resolve => setTimeout(resolve, 50))

    // Set and initialize factories
    setFactories(factoriesToLoad, forceRecalc)

    // Tell loader to prepare for load
    console.log('appStore: prepareLoader: Factories set, starting load process.')
    eventBus.emit('prepareForLoad', {
      count: factories.value.length,
      shown: shownFactories(factories.value),
    })
  }

  // When the loader is ready, we will receive an event saying to initiate the load.
  eventBus.on('readyForData', () => {
    console.log('appStore: Received readyForData event, triggering load.')

    beginLoading(factories.value, true)
  })

  const beginLoading = async (newFactories: Factory[], loadMode = false) => {
    console.log('appStore: beginLoading: start', newFactories, 'loadMode', loadMode)
    loadedCount = 0

    // Reset the factories currently loaded, if there is any
    if (currentFactoryTab.value.factories.length > 0) {
      currentFactoryTab.value.factories = []
    }

    const attemptedFactories = JSON.parse(localStorage.getItem('preLoadFactories') ?? '[]') as Factory[]

    // If there are factories saved from a previous load attempt, replace them now
    if (attemptedFactories.length > 0) {
      console.log('appStore: beginLoading: Found previous factories, loading them instead.')
      newFactories = attemptedFactories
      eventBus.emit('toast', { message: 'Unsuccessful load detected, loading previous factory data.', type: 'warning' })
    } else {
      // Save the user's factories to ensure there is no data loss
      localStorage.setItem('preLoadFactories', JSON.stringify(newFactories))
    }

    // If there's nothing to load, just finish
    if (newFactories.length === 0) {
      loadingCompleted()
      return
    }

    // Inform loader of the counts. Note this will not trigger readyForData again as the v-dialog is already open at this point
    // So the loader's value are just simply updated.
    eventBus.emit('prepareForLoad', { count: newFactories.length, shown: shownFactories(newFactories) })

    // Wait 50ms to allow the loader to update
    await new Promise(resolve => setTimeout(resolve, 50))

    // Start loading the factories
    await loadNextFactory(newFactories)
  }

  const loadNextFactory = async (newFactories: Factory[]) => {
    while (loadedCount < newFactories.length) {
      factories.value.push(newFactories[loadedCount])
      eventBus.emit('incrementLoad', { step: 'increment' })
      loadedCount++

      await new Promise(resolve => setTimeout(resolve, 75)) // Pause between loads
    }

    console.log('appStore: loadNextFactory: Finished loading factories.')
    eventBus.emit('incrementLoad', { step: 'render' })
    await new Promise(resolve => setTimeout(resolve, 75)) // Wait for DOM updates
    loadingCompleted()
  }

  const loadingCompleted = () => {
    console.log('appStore: ============= LOADING COMPLETED =============', factories.value)
    eventBus.emit('loadingCompleted')
    isLoaded.value = true

    // Reset the saved factories
    localStorage.removeItem('preLoadFactories')
  }

  // ==== FACTORY MANAGEMENT
  // This function is needed to ensure that data fixes are applied as we migrate things and change things around.
  const initFactories = (newFactories: Factory[]): Factory[] => {
    console.log('appStore: initFactories', newFactories)
    let needsCalculation = false

    try {
      validateFactories(newFactories, gameData) // Ensure the data is clean
    } catch (err) {
      // If err is type of Error
      if (err instanceof Error) {
        alert('Error validating factories: ' + err.message)
      }
      console.error('appStore: initFactories: Error validating factories:', err)
    }

    newFactories.forEach(factory => {
      // Patch for #222
      if (factory.inSync === undefined) {
        factory.inSync = null
      }
      if (factory.syncState === undefined) {
        factory.syncState = {}
      }

      // Patch for #244 and #180
      // Detect if the factory.parts[part].amountRequiredExports is missing and calculate it.
      Object.keys(factory.parts).forEach(part => {
        // For #244
        if (factory.parts[part].amountRequiredExports === undefined) {
          factory.parts[part].amountRequiredExports = 0
          needsCalculation = true
        }
        if (factory.parts[part].amountRequiredProduction === undefined) {
          factory.parts[part].amountRequiredProduction = 0
          needsCalculation = true
        }

        // For #180
        if (factory.parts[part].amountRequiredPower === undefined) {
          factory.parts[part].amountRequiredPower = 0
          needsCalculation = true
        }
        if (factory.parts[part].amountSuppliedViaRaw === undefined) {
          factory.parts[part].amountSuppliedViaRaw = 0
          needsCalculation = true
        }
        if (factory.parts[part].exportable === undefined) {
          factory.parts[part].exportable = true
          needsCalculation = true
        }
      })

      // Patch for #250
      if (factory.tasks === undefined) {
        factory.tasks = []
      }
      if (factory.notes === undefined) {
        factory.notes = ''
      }

      // Patch for #180
      if (factory.powerProducers === undefined) {
        factory.powerProducers = []
        needsCalculation = true
      }
      if (factory.power === undefined) {
        factory.power = {} as FactoryPower
        needsCalculation = true
      }
      if (factory.previousInputs === undefined) {
        factory.previousInputs = []
      }

      // Patch for #270
      if (factory.syncStatePower === undefined) {
        factory.syncStatePower = {}
      }

      factory.products.forEach(product => {
        // Patch for #11
        if (product.buildingGroups === undefined || product.buildingGroups.length === 0) {
          product.buildingGroups = []
          product.buildingGroupsTrayOpen = false
          product.buildingGroupsHaveProblem = false

          addProductBuildingGroup(product, true)
          // Calculate the building group
          rebalanceBuildingGroups(product, GroupType.Product)
          calculateBuildingGroupParts([product], GroupType.Product)
          calculateProductBuildingGroupPower(product.buildingGroups, product.buildingRequirements.name)
        }

        if (product.buildingGroupsHaveProblem === undefined) {
          product.buildingGroupsHaveProblem = false
        }

        if (product.buildingGroupsTrayOpen === undefined) {
          product.buildingGroupsTrayOpen = false
        }
      })

      factory.powerProducers.forEach(producer => {
        // Patch for #11
        if (producer.buildingGroups === undefined || producer.buildingGroups.length === 0) {
          producer.buildingGroups = []
          producer.buildingGroupsTrayOpen = false
          producer.buildingGroupsHaveProblem = false

          addPowerProducerBuildingGroup(producer, true)
          // // Calculate the building group
          rebalanceBuildingGroups(producer, GroupType.Power)
          calculateBuildingGroupParts([producer], GroupType.Power)
          calculateProductBuildingGroupPower(producer.buildingGroups, producer.building)
        }

        // Patch for #11 renaming ingredientAmount to fuelAmount
        // @ts-ignore
        if (producer.ingredientAmount !== undefined) {
          // @ts-ignore
          producer.fuelAmount = producer.ingredientAmount
          // @ts-ignore
          delete producer.ingredientAmount
        }

        // Patch for #11 adding IDs
        if (producer.id === undefined) {
          producer.id = Math.floor(Math.random() * 10000).toString()
        }

        // Patch for #11 adding Building Groups have problems
        if (producer.buildingGroupsHaveProblem === undefined) {
          producer.buildingGroupsHaveProblem = false
        }
      })

      // Delete keys that no longer exist
      // @ts-ignore
      if (factory.internalProducts) delete factory.internalProducts
      // @ts-ignore
      if (factory.totalPower) delete factory.totalPower
      // @ts-ignore
      if (factory.surplus) delete factory.surplus
      // @ts-ignore
      if (factory.exports) delete factory.exports

      // Update data version
      factory.dataVersion = '2025-02-20'
    })

    if (needsCalculation) {
      console.log('appStore: initFactories: Forcing calculation of factories due to data migration')
      calculateFactories(newFactories, gameDataStore.getGameData())
    }

    console.log('appStore: initFactories - completed')

    inited.value = true
    factories.value = newFactories // Also calls the watcher, which sets the current tab data.
    return factories.value
  }

  const getFactories = () => {
    if (!currentFactoryTab?.value) {
      console.error('appStore: getFactories: No current factory tab set!')
      return []
    }
    // If the factories are not initialized, wait for a duration for the app to load then return them.
    if (!inited.value) {
      // Something wants to load these values so prepare the loader
      eventBus.emit('prepareForLoad', {
        count: currentFactoryTab.value.factories.length,
        shown: shownFactories(currentFactoryTab.value.factories),
      })
    }
    return inited.value ? factories.value : initFactories(currentFactoryTab.value.factories)
  }

  const setFactories = (newFactories: Factory[], forceRecalc = false) => {
    console.log('appStore: setFactories: Setting factories', newFactories)

    const gameData = gameDataStore.getGameData()
    if (!gameData) {
      console.error('appStore: setFactories: Unable to load game data!')
      throw new Error('factories: setFactories: gameData does not exist!')
    }

    // Set inited to false as the new data may be invalid.
    inited.value = false

    // Init factories ensuring the data is valid
    initFactories(newFactories)

    if (forceRecalc) {
      // Trigger calculations
      calculateFactories(newFactories, gameData)
    }

    // For each factory, set the previous inputs to the current inputs.
    newFactories.forEach(factory => {
      factory.previousInputs = factory.inputs
    })

    factories.value = newFactories
    // Will also call the watcher, which sets the current tab data.

    console.log('appStore: setFactories: Factories set.', factories.value)
  }

  const addFactory = (factory: Factory) => {
    // Ensure the factory has the correct display order
    factory.displayOrder = factories.value.length
    factories.value.push(factory)
    console.log('appStore: addFactory: Factory added', factories.value)
  }

  const removeFactory = (id: number) => {
    const index = factories.value.findIndex(factory => factory.id === id)
    if (index !== -1) {
      factories.value.splice(index, 1)
    }

    regenerateSortOrders(getFactories())
  }

  const clearFactories = () => {
    factories.value.length = 0
    factories.value = []
  }
  // ==== END FACTORY MANAGEMENT

  // ==== TAB MANAGEMENT
  const getTab = (id: string) => {
    return factoryTabs.value.find(tab => tab.id === id)
  }
  const getCurrentTab = () => {
    return factoryTabs.value[currentFactoryTabIndex.value]
  }
  const getTabs = () => {
    return factoryTabs.value
  }

  const addTab = ({
    id = crypto.randomUUID(),
    name = 'New Tab',
    factories = [],
  } = {} as Partial<FactoryTab>) => {
    factoryTabs.value.push({
      id,
      name,
      factories,
    })

    currentFactoryTabIndex.value = factoryTabs.value.length - 1
  }

  const removeCurrentTab = async () => {
    if (factoryTabs.value.length === 1) return

    factoryTabs.value.splice(currentFactoryTabIndex.value, 1)
    currentFactoryTabIndex.value = Math.min(currentFactoryTabIndex.value, factoryTabs.value.length - 1)

    // We now need to force a load of the factories, because the tab index may not change, but the factories will have.
    console.log('appStore: removeCurrentTab: Tab removed, preparing loader.')
    prepareLoader(factoryTabs.value[currentFactoryTabIndex.value].factories)
  }
  // ==== END TAB MANAGEMENT

  const getSatisfactionBreakdowns = () => {
    return showSatisfactionBreakdowns
  }
  const changeSatisfactoryBreakdowns = () => {
    showSatisfactionBreakdowns.value = !showSatisfactionBreakdowns.value
    localStorage.setItem('showSatisfactionBreakdowns', showSatisfactionBreakdowns.value ? 'true' : 'false')
  }

  // ==== MISC
  const debugMode = () => {
    if (window.location.hostname !== 'satisfactory-factories.app') {
      return true
    }

    return window.location.search.includes('debug')
  }

  const isSetupDemo = () => {
    return window.location.search.includes('setupDemo')
  }

  if (isSetupDemo()) {
    console.log('appStore: setupDemo: Setting up demo data')
    const factories = complexDemoPlan().getFactories()
    prepareLoader(factories, true)
  }

  isDebugMode.value = debugMode()

  // ==== END MISC

  const forceCalculation = () => {
    const gameData = gameDataStore.getGameData()
    if (!gameData) {
      console.error('Unable to load game data!')
      return
    }

    calculateFactories(factories.value, gameData)
  }

  return {
    currentFactoryTab,
    currentFactoryTabIndex,
    factoryTabs,
    factories,
    lastSave,
    lastEdit,
    isDebugMode,
    isLoaded,
    getLastEdit,
    setLastSave,
    setLastEdit,
    getFactories,
    setFactories,
    initFactories,
    addFactory,
    removeFactory,
    clearFactories,
    getTabs,
    addTab,
    removeCurrentTab,
    getSatisfactionBreakdowns,
    changeSatisfactoryBreakdowns,
    prepareLoader,
    forceCalculation,

    // Testing
    getTab,
    getCurrentTab,
    beginLoading,
    inited,
  }
})
