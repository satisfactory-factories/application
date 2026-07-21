// Utilities
import { defineStore } from 'pinia'
import { Factory, FactoryPower, FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { ref, toRaw, watch } from 'vue'
import { calculateFactories, regenerateSortOrders } from '@/utils/factory-management/factory'
import { useGameDataStore } from '@/stores/game-data-store'
import { validateFactories } from '@/utils/factory-management/validation'
import eventBus from '@/utils/eventBus'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { addProductBuildingGroup } from '@/utils/factory-management/building-groups/product'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'
import { formatNumberFully } from '@/utils/numberFormatter'

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

  // ==== PLAN PERSISTENCE
  // Previously a deep watcher persisted factoryTabs on every reactive flush — on large
  // plans that meant a full-plan traversal per flush plus a multi-second JSON.stringify
  // through the reactive proxies, the dominant per-edit cost. Persistence is now
  // event-driven: calculation commits emit factoryUpdated / calculationsCompleted
  // (debounced into one save), explicit store mutations schedule a save directly, and a
  // periodic compare-and-save plus a flush on tab-hide/close catches direct mutations
  // that bypass the calculator (factory/tab renames, hidden toggles, tasks and such).
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let lastPersistedPlan = ''

  const persistPlan = () => {
    clearTimeout(persistTimer)
    // Stringify the raw tree — stringifying through the reactive proxies is many times slower.
    const json = JSON.stringify(toRaw(factoryTabs.value))
    if (json === lastPersistedPlan) return
    lastPersistedPlan = json
    localStorage.setItem('factoryTabs', json)
    setLastEdit() // Update last edit time whenever the data changes, from any source.
  }

  const schedulePersist = () => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(persistPlan, 500)
  }

  eventBus.on('factoryUpdated', schedulePersist)
  eventBus.on('calculationsCompleted', schedulePersist)

  if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
    setInterval(persistPlan, 5_000)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistPlan()
    })
    window.addEventListener('pagehide', persistPlan)
  }

  // Dev-only test hook: lets browser tests measure reactive churn during interactions.
  // Installing it adds a deep sync watcher over the whole plan — the same (expensive)
  // shape Vue Devtools uses — so it is never active unless a test installs it.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    let watchFires = 0
    let stopCounter: (() => void) | null = null
    interface SfWatchCounter {
      install: () => void
      count: () => number
      reset: () => void
      stop: () => void
    }
    (window as unknown as { __sfWatchCounter: SfWatchCounter }).__sfWatchCounter = {
      install: () => {
        stopCounter?.()
        watchFires = 0
        const handle = watch(factoryTabs.value, () => {
          watchFires++
        }, { deep: true, flush: 'sync' })
        stopCounter = () => handle()
      },
      count: () => watchFires,
      reset: () => {
        watchFires = 0
      },
      stop: () => {
        stopCounter?.()
        stopCounter = null
      },
    }

    // Dev-only: load the ~124-factory stress plan (browser perf harness). Dynamic import
    // so the fixture stays out of the entry chunk.
    ;(window as unknown as { __sfLoadStressPlan: (copies?: number) => Promise<number> }).__sfLoadStressPlan = async (copies = 4) => {
      const { createStressPlan } = await import('@/utils/factory-setups/stress-plan')
      const plan = createStressPlan(copies)
      await prepareLoader(plan, true)
      return plan.length
    }

    // Dev-only: lets tests await "all factories rendered" instead of polling the DOM.
    const loadsWindow = window as unknown as { __sfLoadsCompleted: number }
    loadsWindow.__sfLoadsCompleted = 0
    eventBus.on('loadingCompleted', () => {
      loadsWindow.__sfLoadsCompleted++
    })
  }

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

        // Patch for #431
        // Raw resource supply used to be double counted when the part was also supplied via
        // inputs or production (e.g. unpackaging Packaged Oil into Crude Oil). Detect the
        // stale over-supply in saved plans and force a recalculation.
        const partData = factory.parts[part]
        if (partData.isRaw && partData.amountSuppliedViaRaw > 0) {
          const rawShortfall = Math.max(0,
            (partData.amountRequired ?? 0) -
            (partData.amountSuppliedViaInput ?? 0) -
            (partData.amountSuppliedViaProduction ?? 0)
          )
          if (partData.amountSuppliedViaRaw > rawShortfall) {
            needsCalculation = true
          }
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
          product.buildingGroupItemSync = true

          addProductBuildingGroup(product, factory, true)
        }

        if (product.buildingGroupsHaveProblem === undefined) {
          product.buildingGroupsHaveProblem = false
        }

        if (product.buildingGroupsTrayOpen === undefined) {
          product.buildingGroupsTrayOpen = false
        }

        // Patch for quantity precision. The game does not go more precise than 3 decimal
        // places, but older saves can hold amounts like 1.6666666667. Force a
        // recalculation, which now rounds product quantities.
        if (product.amount !== formatNumberFully(product.amount)) {
          needsCalculation = true
        }
      })

      factory.powerProducers.forEach(producer => {
        // Patch for #11
        if (producer.buildingGroups === undefined || producer.buildingGroups.length === 0) {
          producer.buildingGroups = []
          producer.buildingGroupsTrayOpen = false
          producer.buildingGroupsHaveProblem = false
          producer.buildingGroupItemSync = true

          // Only backfill a group when the producer has calculated buildings to mirror.
          // An uncalculated producer (e.g. a plan template defined via powerAmount) would
          // get a 0-building group, which the sacrosanct-groups recalculation then syncs
          // the producer down to — zeroing its generation. Let the calculation create it.
          if (producer.buildingCount > 0) {
            addPowerProducerBuildingGroup(producer, factory, true)
          } else {
            needsCalculation = true
          }
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

    // Only recalculate when a data migration actually backfilled a missing field. A plan
    // whose derived data is already current — the common case, e.g. switching between tabs —
    // is stored fully calculated, so recalculating it is pure wasted work that blocks the main
    // thread (and blanks the screen) for several seconds on large plans. Callers that genuinely
    // need a recalc pass forceRecalc to setFactories or use forceCalculation. The 'recalculate'
    // origin treats the user's building groups as sacrosanct, so the backfill is safe.
    if (needsCalculation) {
      console.log('appStore: initFactories: Data migrations were applied, recalculating')
      calculateFactories(newFactories, gameDataStore.getGameData(), { origin: 'recalculate' })
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
      calculateFactories(newFactories, gameData, { origin: 'recalculate' })
    }

    // For each factory, snapshot the current inputs as the previous inputs. Must be a
    // copy — aliasing the live array would make the "previous" state track the current
    // one (and corrupts the in-place diff commit in calculateFactories).
    newFactories.forEach(factory => {
      factory.previousInputs = factory.inputs.map(input => ({ ...input }))
    })

    factories.value = newFactories
    // Loads without a recalc emit no calculation events, so persist explicitly.
    schedulePersist()
    // Will also call the watcher, which sets the current tab data.

    console.log('appStore: setFactories: Factories set.', factories.value)
  }

  const addFactory = (factory: Factory) => {
    // Ensure the factory has the correct display order
    factory.displayOrder = factories.value.length
    factories.value.push(factory)
    console.log('appStore: addFactory: Factory added', factories.value)

    // Adding a factory doesn't necessarily run a calculation, so announce and persist
    // explicitly — otherwise the new factory isn't saved (or seen by sync) until the
    // periodic safety net catches it.
    eventBus.emit('factoryUpdated', factory)
    schedulePersist()
  }

  const removeFactory = (id: number) => {
    const index = factories.value.findIndex(factory => factory.id === id)
    if (index !== -1) {
      const [removed] = factories.value.splice(index, 1)
      eventBus.emit('factoryUpdated', removed)
      schedulePersist()
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
    schedulePersist()
  }

  const removeCurrentTab = async () => {
    if (factoryTabs.value.length === 1) return

    factoryTabs.value.splice(currentFactoryTabIndex.value, 1)
    currentFactoryTabIndex.value = Math.min(currentFactoryTabIndex.value, factoryTabs.value.length - 1)
    schedulePersist()

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

    // Building groups are sacrosanct on a recalculation — they are never rebalanced;
    // item quantities are adjusted to match the groups instead.
    calculateFactories(factories.value, gameData, { origin: 'recalculate' })
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
