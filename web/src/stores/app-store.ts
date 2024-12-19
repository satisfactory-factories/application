// Utilities
import { defineStore } from 'pinia'
import { Factory, FactoryPower, FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { nextTick, ref, watch } from 'vue'
import { calculateFactories } from '@/utils/factory-management/factory'
import { useGameDataStore } from '@/stores/game-data-store'
import { validateFactories } from '@/utils/factory-management/validation'
import eventBus from '@/utils/eventBus'

export const useAppStore = defineStore('app', () => {
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

  const currentFactoryTabIndex = ref(0)
  const currentFactoryTab = ref(factoryTabs.value[currentFactoryTabIndex.value])

  const factories = computed({
    get () {
      return currentFactoryTab.value.factories
    },
    set (value) {
      currentFactoryTab.value.factories = value
      initFactories(true)
    },
  })

  const lastSave = ref<Date>(new Date(localStorage.getItem('lastSave') ?? ''))
  const lastEdit = ref<Date>(new Date(localStorage.getItem('lastEdit') ?? ''))
  const isDebugMode = ref<boolean>(false)
  const showSatisfactionBreakdowns = ref<boolean>(
    (localStorage.getItem('showSatisfactionBreakdowns') ?? 'false') === 'true'
  )
  const gameDataStore = useGameDataStore()

  // Watch the tab index, if it changes we need to throw up a loading
  watch(currentFactoryTabIndex, () => {
    eventBus.emit('showLoading', factoryTabs.value[currentFactoryTabIndex.value].factories.length)
    requestAnimationFrame(() => {
      setTimeout(() => {
        currentFactoryTab.value = factoryTabs.value[currentFactoryTabIndex.value]
        initFactories()
      }, 250)
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

  const startLoad = async (newFactories?: Factory[], loadMode = false) => {
    eventBus.off('nextLoad') // Ensure nextLoad is unloaded before starting a new load

    const factoriesToLoad = newFactories ?? currentFactoryTab.value.factories
    console.log('appStore: startLoad', factoriesToLoad)
    eventBus.emit('showLoading', factoriesToLoad.length)

    await nextTick() // Wait for Vue's reactivity system to complete updating the planner

    // Clear the current factories before loading new ones
    currentFactoryTab.value.factories = []

    console.log('startLoad: Cleared current factories, awaiting Vue tick')
    await nextTick() // Wait for Vue's reactivity system to complete updating

    console.log('startLoad: Cleared current factories, starting incremental load')
    loadFactoriesIncrementally(factoriesToLoad, loadMode)
  }

  const loadFactoriesIncrementally = (newFactories: Factory[], loadMode = false) => {
    console.log('loadFactoriesIncrementally: Loading factories incrementally', newFactories)
    loadedCount = 0

    const loadNextFactory = async () => {
      console.log('loadFactoriesIncrementally: Loading factory', loadedCount + 1, '/', newFactories.length)
      if (loadedCount >= newFactories.length) {
        console.log('loadFactoriesIncrementally: Finished loading factories')
        eventBus.emit('incrementLoad', { step: 'calculation' })

        // Wait for Vue's reactivity system to complete updating
        await nextTick()

        // Calculate factories after loading is completed
        requestAnimationFrame(() => {
        // Add a small delay to allow the loader to update before calculating the factories
          setTimeout(() => {
            const gameData = gameDataStore.getGameData()
            calculateFactories(currentFactoryTab.value.factories, gameData, loadMode)
            eventBus.emit('loadingCompleted')

            // Ensure that the data written to local storage is up to date
            localStorage.setItem('factoryTabs', JSON.stringify(factoryTabs.value))
          }, 150)
        })
        return
      }

      // Add the factory to the current tab's factories
      console.log(`loadFactoriesIncrementally: Adding factory ${loadedCount + 1}/${newFactories.length}`)
      currentFactoryTab.value.factories.push(newFactories[loadedCount])
      eventBus.emit('incrementLoad', { step: 'loading' })
      loadedCount++

      // Wait for Vue's reactivity system to complete updating
      await nextTick()
      requestAnimationFrame(() => {
        // Add a small delay to allow the UI to update before loading the next factory, plus it looks nicer
        setTimeout(() => {
          eventBus.emit('nextLoad')
        }, 50)
      })
    }

    // Register the event that's emitted when the next factory should be loaded
    eventBus.on('nextLoad', loadNextFactory)
    loadNextFactory()
  }

  eventBus.on('loadingReady', () => {
    console.log('appStore: Received loadingReady event')
    if (!inited.value) {
      startLoad()
    }
  })

  // ==== FACTORY MANAGEMENT
  // This function is needed to ensure that data fixes are applied as we migrate things and change things around.
  const initFactories = (loadMode = false): void => {
    console.log('appStore: initFactories - load mode:', loadMode)
    let needsCalculation = false

    try {
      validateFactories(factories.value) // Ensure the data is clean
    } catch (err) {
      alert('Error validating factories: ' + err)
    }

    factories.value.forEach(factory => {
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
    })

    if (needsCalculation) {
      console.log('appStore: Forcing calculation of factories due to data migration')
      calculateFactories(factories.value, gameDataStore.getGameData())
      eventBus.emit('hideLoading')
    }

    console.log('appStore: initFactories - completed')

    inited.value = true
  }

  const setFactories = (newFactories: Factory[], loadMode = false) => {
    console.log('Setting factories', newFactories, 'loadMode:', loadMode)

    const gameData = gameDataStore.getGameData()
    if (!gameData) {
      console.error('Unable to load game data!')
      return
    }

    validateFactories(newFactories) // Ensure the data is clean

    // Run getFactories to determine if calculations are required
    initFactories()

    // Trigger calculations
    calculateFactories(newFactories, gameData, loadMode)

    // For each factory, set the previous inputs to the current inputs.
    newFactories.forEach(factory => {
      factory.previousInputs = factory.inputs
    })

    // Will also call the watcher.
    factories.value = newFactories

    eventBus.emit('loadingCompleted')
  }

  const addFactory = (factory: Factory) => {
    factories.value.push(factory)
  }

  const removeFactory = (id: number) => {
    const index = factories.value.findIndex(factory => factory.id === id)
    if (index !== -1) {
      factories.value.splice(index, 1)
    }
  }

  const clearFactories = () => {
    factories.value.length = 0
    factories.value = []
  }
  // ==== END FACTORY MANAGEMENT

  // ==== TAB MANAGEMENT
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

    if (factories.value.length && !window.confirm('Are you sure you want to delete this tab? This will delete all factories in it.')) {
      return
    }

    factoryTabs.value.splice(currentFactoryTabIndex.value, 1)
    currentFactoryTabIndex.value = Math.min(currentFactoryTabIndex.value, factoryTabs.value.length - 1)
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

  isDebugMode.value = debugMode()
  // ==== END MISC

  // When the loader is ready, we will receive an event saying to initiate the load.
  eventBus.on('readyForFirstLoad', () => {
    console.log('appStore: Received readyForFirstLoad event')
    startLoad()
  })

  return {
    currentFactoryTab,
    currentFactoryTabIndex,
    factoryTabs,
    factories,
    lastSave,
    lastEdit,
    isDebugMode,
    getLastEdit,
    setLastSave,
    setLastEdit,
    getFactories: () => factories.value,
    setFactories,
    addFactory,
    removeFactory,
    clearFactories,
    addTab,
    removeCurrentTab,
    getSatisfactionBreakdowns,
    changeSatisfactoryBreakdowns,
    startLoad,
  }
})
