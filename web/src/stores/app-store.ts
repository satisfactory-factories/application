// Utilities
import { defineStore } from 'pinia'
import {
  Factory,
  FactoryPower,
  FactoryTab,
  PlannerState,
  PlannerUserOptions,
} from '@/interfaces/planner/FactoryInterface'
import { ref } from 'vue'
import { calculateFactories, regenerateSortOrders } from '@/utils/factory-management/factory'
import { useGameDataStore } from '@/stores/game-data-store'
import { validateFactories } from '@/utils/factory-management/validation'
import eventBus from '@/utils/eventBus'
import {
  addTab,
  deleteTab,
  getCurrentTab,
  getTab,
  getTabsCount,
  migrateFactoryTabsToState,
  newState,
  newTab,
} from '@/utils/plannerStateManagement'

export const useAppStore = defineStore('app', () => {
  const gameDataStore = useGameDataStore()
  const gameData = gameDataStore.getGameData()

  const inited = ref(false)
  let loadedCount = 0
  const plannerState = ref<PlannerState>(JSON.parse(<string>localStorage.getItem('plannerState') ?? '{}') as PlannerState)
  const oldState = JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as FactoryTab[] | null

  // If the new state doesn't exist and the old one does, migrate it.
  if (!plannerState.value.tabs && oldState && oldState.length > 0) {
    console.log('appStore: INIT: Found old factory state, migrating.')

    plannerState.value = migrateFactoryTabsToState(oldState)

    // Don't delete the factoryTab data just yet to ensure people have a revert option.
    // This will be removed in a future update.
    // localStorage.removeItem('factoryTabs')
    localStorage.removeItem('currentFactoryTabIndex')
    localStorage.setItem('plannerState.value', JSON.stringify(plannerState.value))
    eventBus.emit('toast', {
      message: 'Your planner data has just been migrated to the new format. You will need to re-log in if you were backing up your data with an account.\n\nPlease report any issues with missing data etc to Discord, where we can help you restore any lost data.',
      type: 'success',
    })
  }

  // If the state is not set, create a new one now
  if (!plannerState.value.tabs) {
    console.log('appStore: INIT: plannerState.value not found, creating new state.')
    plannerState.value = newState({})
  }

  // The current tab is the actual data we'll be working with.
  // The displayedTab is changed as and when the loader deems it ready to be changed.
  // Otherwise, if we are dependent on the currentTabId, we'll be swapping the data before the loader is ready due to reactivity.
  const currentTabId = ref(plannerState.value.currentTabId)
  let currentTab = reactive(getTab(plannerState.value, currentTabId.value))
  const pendingTabId = ref('')

  const displayedFactories = computed({
    get () {
      if (!currentTab) {
        console.error('appStore: displayedFactories.get: No displayed tab not set!')
        return []
      }
      // Ensure that the factories are initialized before returning them on the first request
      if (!inited.value) {
        console.log('appStore: displayedFactories.get: Factories not inited, initializing')
        initFactories(currentTab.factories)
      }
      return currentTab.factories
    },
    set (value) {
      currentTab.factories = value
    },
  })

  const isDebugMode = ref<boolean>(false)
  const isLoaded = ref<boolean>(false)

  const shownFactories = (factories: Factory[]) => {
    return factories.filter(factory => !factory.hidden).length
  }

  // Watch the state and save changes to local storage
  watch(plannerState.value, () => {
    console.log('appStore: plannerState changed, saving to local storage.')
    localStorage.setItem('plannerState', JSON.stringify(plannerState.value))
    setLastEdited() // Update last edit time whenever the data changes, from any source.
  }, { deep: true })

  const prepareLoader = async (newFactories?: Factory[], forceRecalc = false) => {
    console.log('==== CURRENT TAB ID ====', currentTabId.value)
    console.log('==== PENDING TAB ID ====', pendingTabId.value)
    isLoaded.value = false

    const factoriesToLoad = newFactories ?? displayedFactories.value
    console.log('appStore: prepareLoader', factoriesToLoad)

    // Tell planner to hide to remove all rendered content
    eventBus.emit('plannerHideContent')

    // Wait a bit for the planner to comply
    await new Promise(resolve => setTimeout(resolve, 50))

    // Set and initialize factories
    setFactories(factoriesToLoad, forceRecalc)

    // Tell loader to prepare for load
    console.log('appStore: prepareLoader: Factories set, starting load process.')
    eventBus.emit('prepareForLoad', {
      // Purposefully not factoriesToLoad, as it should be set by setFactories
      count: displayedFactories.value.length,
      shown: shownFactories(displayedFactories.value),
    })
  }

  // When the loader is ready, we will receive an event saying to initiate the load.
  eventBus.on('readyForData', () => {
    console.log('appStore: Received readyForData event, triggering load.')
    beginLoading(displayedFactories.value, true)
  })

  const beginLoading = async (newFactories: Factory[], loadMode = false) => {
    console.log('appStore: beginLoading', newFactories, 'loadMode', loadMode)
    loadedCount = 0

    // Reset the factories currently loaded, if there is any
    if (displayedFactories.value.length > 0) {
      displayedFactories.value = []
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

    // Inform loader of the counts.
    // Note this will not trigger readyForData again as the v-dialog is already open at this point
    // So the loader's value are just simply updated.
    eventBus.emit('prepareForLoad', { count: newFactories.length, shown: shownFactories(newFactories) })

    // Wait 50ms to allow the loader to update
    await new Promise(resolve => setTimeout(resolve, 50))

    // Start loading the factories
    await loadNextFactory(newFactories)
  }

  const loadNextFactory = async (newFactories: Factory[]) => {
    while (loadedCount < newFactories.length) {
      currentTab.factories.push(newFactories[loadedCount])
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
    console.log('appStore: ============= LOADING COMPLETED =============', plannerState.value)
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
      alert('Error validating factories: ' + err)
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
      factory.dataVersion = '2025-01-03.2'
    })

    if (needsCalculation) {
      console.log('appStore: initFactories: Forcing calculation of factories due to data migration')
      calculateFactories(newFactories, gameDataStore.getGameData())
    }

    console.log('appStore: initFactories - completed')

    inited.value = true
    displayedFactories.value = newFactories // Also calls the watcher, which sets the current tab data.
    return displayedFactories.value
  }

  const getFactories = () => {
    if (!currentTab) {
      console.error('appStore: getFactories: No current factory tab set!')
      return []
    }
    // If the factories are not initialized, prepare for them to be loaded
    if (!inited.value) {
      eventBus.emit('prepareForLoad', {
        count: currentTab.factories.length,
        shown: shownFactories(currentTab.factories),
      })
    }
    return inited.value ? displayedFactories.value : initFactories(currentTab.factories)
  }

  const setFactories = (newFactories: Factory[], forceRecalc = false) => {
    console.log('appStore: setFactories: Setting factories', newFactories)

    const gameData = gameDataStore.getGameData()
    if (!gameData) {
      console.error('appStore: setFactories: Unable to load game data!')
      return
    }

    // If there's a pending tabId, swap the tabs round now. Otherwise, we delete the data on the tab we're swapping from.
    if (pendingTabId.value) {
      console.log('appStore: setFactories: Setting new tabId:', pendingTabId.value)
      currentTabId.value = pendingTabId.value
      plannerState.value.currentTabId = pendingTabId.value
      currentTab = getCurrentTab(plannerState.value)
      // This therefore should change the current tab as it's referenced
      pendingTabId.value = ''
    } else {
      console.log('appStore: setFactories: No pending tabId, sticking with:', currentTabId.value)
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

    displayedFactories.value = newFactories

    console.log('appStore: setFactories: Factories set.', displayedFactories.value)
  }

  const addFactory = (factory: Factory) => {
    // Ensure the factory has the correct display order
    factory.displayOrder = displayedFactories.value.length
    displayedFactories.value.push(factory)
    console.log('appStore: addFactory: Factory added', displayedFactories.value)
  }

  const removeFactory = (id: number) => {
    const index = displayedFactories.value.findIndex(factory => factory.id === id)
    if (index !== -1) {
      displayedFactories.value.splice(index, 1)
    }

    regenerateSortOrders(getFactories())
  }

  const clearFactories = () => {
    displayedFactories.value.length = 0
    displayedFactories.value = []
  }
  // ==== END FACTORY MANAGEMENT

  // ==== TAB MANAGEMENT
  const createNewTab = ({
    id = crypto.randomUUID(),
    name = 'New Tab',
    factories = [],
  } = {} as Partial<FactoryTab>) => {
    const newTabData = newTab({ id, name, factories })
    addTab(plannerState.value, newTabData)
    currentTabId.value = newTabData.id

    // Tell Tab Navigation of the new tab and to switch to it
    console.log('appStore: createNewTab: Tab created, switching tab to:', newTabData.id)
    eventBus.emit('switchTab', newTabData.id)
  }

  const removeCurrentTab = () => {
    if (getTabsCount(plannerState.value) === 1) return

    console.log('appStore: removeCurrentTab: Removing current tab:', currentTab.id)

    deleteTab(plannerState.value, currentTab)
    // Get the new tab index by looking at the last tab in the list
    currentTabId.value = plannerState.value.currentTabId

    // Swap to the last tab remaining
    const switchToTabId = getCurrentTab(plannerState.value).id
    console.log('appStore: removeCurrentTab: Tab removed, switching tab to:', switchToTabId)
    eventBus.emit('switchTab', switchToTabId)
  }
  // ==== END TAB MANAGEMENT

  // ==== STATE MANAGEMENT
  const getState = () => {
    return plannerState.value
  }
  const setState = (state: PlannerState) => {
    console.log('appStore: setState', state)
    plannerState.value = state
  }

  const getTabs = () => {
    return plannerState.value.tabs
  }

  const setTabs = (tabs: { [key: string]: FactoryTab }) => {
    plannerState.value.tabs = tabs
    // Get the first tab in the list
    const firstTab = Object.keys(plannerState.value.tabs)[0]
    currentTabId.value = plannerState.value.tabs[firstTab].id
  }

  const changeCurrentTab = async (tabId: string) => {
    console.log('appStore: === CHANGING TAB ===:', tabId)
    pendingTabId.value = tabId

    const factories = getTab(plannerState.value, tabId).factories
    await prepareLoader(factories)
  }

  const getLastEdited = (): Date => {
    const lastEdited = localStorage.getItem('plannerLastEdited')
    if (!lastEdited) {
      // Set it now
      setLastEdited()
      return getLastEdited()
    }

    return new Date(lastEdited)
  }
  const setLastEdited = (override?: Date) => {
    const value = override?.toISOString() ?? new Date().toISOString()
    localStorage.setItem('plannerLastEdited', value)
  }
  const getLastSaved = (): Date | null => {
    const lastSaved = localStorage.getItem('plannerLastSaved')

    if (!lastSaved) {
      return null
    }
    return new Date(lastSaved)
  }
  const setLastSaved = (override?: Date) => {
    const value = override?.toISOString() ?? new Date().toISOString()
    localStorage.setItem('plannerLastSaved', value)
  }
  const getUserOptions = () => {
    return plannerState.value.userOptions
  }
  const setUserOptions = (options: PlannerUserOptions) => {
    console.log('appStore: setUserOptions', options)
    Object.assign(plannerState.value.userOptions, options)
  }

  // ==== END STATE MANAGEMENT

  // ==== MISC
  const debugMode = () => {
    if (window.location.hostname !== 'satisfactory-factories.app') {
      return true
    }

    return window.location.search.includes('debug')
  }

  isDebugMode.value = debugMode()
  // ==== END MISC

  eventBus.on('factoryUpdated', () => {
    console.log('appStore: factoryUpdated: Factory updated, setting last edited')
    setLastEdited()
    console.log('updated factory result', currentTab)
  })

  return {
    currentTab,
    currentTabId,
    plannerState,
    isInitialized: inited,
    isDebugMode,
    isLoaded,
    getFactories,
    setFactories,
    initFactories,
    addFactory,
    removeFactory,
    clearFactories,
    createNewTab,
    removeCurrentTab,
    getState,
    setState,
    getTabs,
    setTabs,
    changeCurrentTab,
    getLastEdited,
    setLastEdited,
    getLastSaved,
    setLastSaved,
    getUserOptions,
    setUserOptions,
    prepareLoader,

    // Testing purposes only
    beginLoading,
    loadNextFactory,
  }
})
