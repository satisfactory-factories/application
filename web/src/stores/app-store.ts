// Utilities
import { defineStore } from 'pinia'
import { Factory, FactoryPower, FactoryTab, ItemType, LegacyRawAssumptionFields } from '@/interfaces/planner/FactoryInterface'
import { ref, toRaw, watch } from 'vue'
import { calculateFactories, generateFactoryId, regenerateSortOrders } from '@/utils/factory-management/factory'
import { useGameDataStore } from '@/stores/game-data-store'
import { validateFactories } from '@/utils/factory-management/validation'
import eventBus from '@/utils/eventBus'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
import { addProductBuildingGroup } from '@/utils/factory-management/building-groups/product'
import { addPowerProducerBuildingGroup } from '@/utils/factory-management/building-groups/power'
import { refreshBuildingGroupProblems } from '@/utils/factory-management/building-groups/common'
import { formatNumberFully } from '@/utils/numberFormatter'
import { PlanRepair, repairPlanPrecision } from '@/utils/factory-management/repair'
import { collectRawWizardRows } from '@/utils/factory-management/raw-wizard'
import { getHandGatheredParts } from '@/utils/factory-management/parts'
import { config } from '@/config/config'

export const useAppStore = defineStore('app', () => {
  const gameDataStore = useGameDataStore()
  const gameData = gameDataStore.getGameData()

  const inited = ref(false)
  let loadedCount = 0
  const factoryTabs = ref<FactoryTab[]>(JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as FactoryTab[])

  if (factoryTabs.value.length === 0) {
    // Fill the tabs from the legacy factories array if present so no data gets lost
    const legacyFactories: Factory[] = JSON.parse(localStorage.getItem('factories') ?? '[]')
    factoryTabs.value = [
      {
        id: crypto.randomUUID(),
        name: 'Default',
        factories: legacyFactories,
        // A tab conjured out of nothing has never assumed a raw resource in its life, so it is
        // born answered. One filled from the legacy array is a plan from before the change and
        // must still be asked about.
        plannerVersion: legacyFactories.length > 0 ? undefined : config.plannerVersion,
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
  // Quantities repairPlanPrecision corrected on the last load, awaiting the user being told.
  const planRepairs = ref<PlanRepair[]>([])
  const showSatisfactionBreakdowns = ref<boolean>(
    (localStorage.getItem('showSatisfactionBreakdowns') ?? 'false') === 'true'
  )

  // ==== RAW RESOURCES BREAKING-CHANGE NOTICE
  // Raw resources are no longer assumed to be supplied — they are mined or imported like anything
  // else, and only the resources the game gives no extractor for (Leaves, Wood, alien remains...)
  // are still taken as gathered by hand. There is deliberately no setting: an optional assumption
  // meant two plans could disagree about what they meant, and the answer was invisible on the card.
  //
  // That silently turns saved plans red, so say so once. Once, and never again — otherwise every
  // old plan the user opens interrupts them with the same news.
  const showRawBreakingNotice = ref<boolean>(false)

  // Answered per PLAN, not per browser. A single localStorage flag meant dismissing this once
  // silenced it for every plan the user opened afterwards — so the next pre-v0.6 plan they
  // pasted, opened from a share link or restored from their account sat there red with nothing
  // on screen explaining why. The answer belongs to the plan, and travels with it.
  const askRawBreakingNotice = () => {
    const tab = getCurrentTab()

    // A plan that has been answered, and one that has nothing to answer for, are both silent.
    // The second half matters: a plan from before the change that happens to import everything
    // it needs is not worth interrupting anyone about.
    showRawBreakingNotice.value = Boolean(tab) &&
      !tab.plannerVersion &&
      collectRawWizardRows(factories.value).length > 0
  }

  // Stamping on dismissal is deliberate: the flag records that the user has ANSWERED for this
  // plan, not that the plan is fixed. Saying "I'll sort it myself" is an answer, and being asked
  // again every time they open their own plan would be the wrong reward for it.
  const dismissRawBreakingNotice = () => {
    const tab = getCurrentTab()
    if (tab) {
      tab.plannerVersion = config.plannerVersion
    }
    showRawBreakingNotice.value = false
    // Tab-level state reaches neither the local save nor the cloud dirty flag on its own —
    // both hang off factory events — so say so explicitly.
    eventBus.emit('planUpdated')
    schedulePersist()
  }

  // Hand the notice over to something that is about to say the same thing better — the v0.6
  // splash, whose first slide IS this warning and which will not close until it is acknowledged.
  // Deliberately NOT marked as seen: if that acknowledgement never comes (the tab is closed on
  // the slide), the next load raises the notice again rather than losing it silently.
  const deferRawBreakingNotice = () => {
    showRawBreakingNotice.value = false
  }

  // Debug scenario only: put the notice back to never-seen so it behaves as it does for someone
  // opening a plan built before this change. Otherwise it is unreachable once dismissed.
  const rearmRawBreakingNotice = () => {
    const tab = getCurrentTab()
    if (tab) {
      delete tab.plannerVersion
    }
    // Deliberately does not ask here: the plan being re-armed has not loaded yet, so the only
    // thing to evaluate at this point is the one on its way out. loadingCompleted does it.
  }

  const shownFactories = (factories: Factory[]) => {
    return factories.filter(factory => !factory.hidden).length
  }

  // The tab-switch load is deferred to the next frame so the loading overlay paints
  // before the work starts. jsdom implements requestAnimationFrame on a ~16ms timer,
  // so under Vitest that instead defers it past the end of the spec that switched
  // tabs: the callback then logs — and starts the whole load cascade, which logs
  // more — while the worker is being torn down, and Vitest fails the run with
  // "Closing rpc while onUserConsoleLog was pending". Nothing paints in tests, so
  // run it inline and keep the work inside the test that asked for it.
  const afterPaint = (fn: () => void) => {
    if (import.meta.env.MODE === 'test') fn()
    else requestAnimationFrame(fn)
  }

  // Watch the tab index, if it changes we need to throw up a loading
  watch(currentFactoryTabIndex, () => {
    afterPaint(() => {
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

  /**
   * @param fromLoad only ever true for a debounced write that a LOAD scheduled. The v0.6 migration
   * recalculates as it loads, and stamping that as an edit would make a stale browser copy look
   * newer than the account's — which is exactly what checkForOOS reads to decide whether to warn
   * before overwriting.
   *
   * Provenance is passed into the timer rather than held in a shared flag, because persistPlan is
   * also called DIRECTLY by the interval, visibilitychange and pagehide below. Those exist to catch
   * mutations that bypass schedulePersist entirely, so a shared flag let them consume a load's
   * provenance and save a real edit without its timestamp.
   *
   * Their default is the CURRENT loading state, read at call time, rather than a flat false: the
   * 5-second interval fires during any load that takes longer than that, and switching browser tabs
   * mid-load fires visibilitychange. Treating those as user work stamped a plan nobody had edited.
   */
  const persistPlan = (fromLoad = !isLoaded.value) => {
    clearTimeout(persistTimer)
    // A user edit that is still waiting to be written stamps the plan even if the write itself was
    // ordered by a load. Renaming a factory and switching tab inside the 500ms window used to lose
    // the timestamp: the load's schedulePersist cancelled the user's timer and inherited the write,
    // so the rename reached localStorage while lastEdit still described the plan before it.
    const userEditPending = pendingUserEdit
    pendingUserEdit = false
    // Stringify the raw tree — stringifying through the reactive proxies is many times slower.
    const json = JSON.stringify(toRaw(factoryTabs.value))
    if (json === lastPersistedPlan) return
    lastPersistedPlan = json
    localStorage.setItem('factoryTabs', json)
    if (!fromLoad || userEditPending) {
      setLastEdit() // Update last edit time whenever the data changes, from any source.
    }
  }

  // Sticky until the write actually happens. schedulePersist cancels and replaces the pending
  // timer, so without this the LAST scheduler decided the provenance of a write that may already
  // contain someone's edit.
  let pendingUserEdit = false

  const schedulePersist = () => {
    // Read now, not when the timer fires: persistence is debounced by 500ms and a load finishes
    // well inside that, so reading isLoaded at fire time saw a loaded app and stamped it anyway.
    const duringLoad = !isLoaded.value
    if (!duringLoad) {
      pendingUserEdit = true
    }
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => persistPlan(duringLoad), 500)
  }

  eventBus.on('factoryUpdated', schedulePersist)
  eventBus.on('calculationsCompleted', schedulePersist)

  if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
    // All three wrapped: pagehide would otherwise hand its Event object in as `fromLoad`, which is
    // truthy, and silently stop the close-the-tab flush from stamping the edit.
    setInterval(() => persistPlan(), 5_000)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistPlan()
    })
    window.addEventListener('pagehide', () => persistPlan())
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

  // The pauses in the load sequence pace the browser: they give Vue a chance to flush
  // and paint between factories so a large plan appears progressively instead of
  // locking the tab. There is nothing to paint under Vitest, where they only leave the
  // chain sleeping — and logging — after the spec that kicked it off has finished.
  // `readyForData` starts that chain fire-and-forget, so no spec can await it, and a
  // log still in flight when the worker is torn down fails the whole run with
  // "Closing rpc while onUserConsoleLog was pending".
  const loadPause = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, import.meta.env.MODE === 'test' ? 0 : ms))

  const prepareLoader = async (newFactories?: Factory[], forceRecalc = false) => {
    isLoaded.value = false
    const factoriesToLoad = newFactories ?? factories.value
    console.log('appStore: prepareLoader', factoriesToLoad)

    // Tell planner to hide to remove all rendered content
    eventBus.emit('plannerShow', false)

    // Wait a bit for the planner to comply
    await loadPause(50)

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

    // The assumption is gone; drop what saved plans still carry for it so they stop hauling a
    // dead field through every share, paste and sync from here on.
    const tab = getCurrentTab() as (FactoryTab & LegacyRawAssumptionFields) | undefined
    if (tab) {
      delete tab.assumeRawInputs
    }
    newFactories.forEach(factory => delete (factory as Factory & LegacyRawAssumptionFields).assumeRawInputs)

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
    await loadPause(50)

    // Start loading the factories
    await loadNextFactory(newFactories)
  }

  const loadNextFactory = async (newFactories: Factory[]) => {
    while (loadedCount < newFactories.length) {
      factories.value.push(newFactories[loadedCount])
      eventBus.emit('incrementLoad', { step: 'increment' })
      loadedCount++

      await loadPause(75) // Pause between loads
    }

    console.log('appStore: loadNextFactory: Finished loading factories.')
    eventBus.emit('incrementLoad', { step: 'render' })
    await loadPause(75) // Wait for DOM updates
    loadingCompleted()
  }

  const loadingCompleted = () => {
    console.log('appStore: ============= LOADING COMPLETED =============', factories.value)

    // Asked here rather than at the top of the load for two reasons: the loader may swap in a
    // recovered plan part way through, so this is the first point the plan is the one being
    // loaded; and the check reads the part ledgers, which do not exist until the plan has been
    // through initFactories. It also has to settle before loadingCompleted is announced, since
    // the v0.6 splash opens on that event and needs to know whether this plan is asking anything.
    askRawBreakingNotice()

    eventBus.emit('loadingCompleted')

    // Flushed synchronously, as a load, BEFORE the flag flips. Everything above has scheduled a
    // debounced write 500ms out; the moment isLoaded is true, a direct flush (the 5-second
    // interval, a tab switch, closing the tab) that lands inside that window would cancel the
    // pending load-origin write and save the migration as though the user had made it, stamping
    // lastEdit. Writing it here leaves that later write with nothing to do, since persistPlan
    // returns early when the plan has not changed since the last one.
    persistPlan(true)
    isLoaded.value = true

    // Reset the saved factories
    localStorage.removeItem('preLoadFactories')
  }

  // ==== FACTORY MANAGEMENT
  // This function is needed to ensure that data fixes are applied as we migrate things and change things around.
  const initFactories = (newFactories: Factory[]): Factory[] => {
    console.log('appStore: initFactories', newFactories)
    let needsCalculation = false
    // The same set calculatePartRaw uses, so the pre-v0.6 detector below cannot drift from it.
    const handGathered = getHandGatheredParts(gameData)

    // Everything the loader put right, from any source, reported together in one dialog.
    // Reset first: the dialog describes the plan being loaded now, so repairs the previous
    // plan needed (a template loaded over another, say) must not ride along with it.
    const repairs: PlanRepair[] = []
    planRepairs.value = []

    try {
      repairs.push(...validateFactories(newFactories, gameData, getCurrentTab()))
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

        // For #478
        if (factory.parts[part].amountRequiredBuildings === undefined) {
          factory.parts[part].amountRequiredBuildings = 0
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

        // Patch for #503. Before v0.6 the planner supplied any raw shortfall itself, so a plan
        // saved then still reads satisfied — and every gate downstream believes it: no red
        // factories, no breaking-change notice, and a wizard that reports nothing to fix. Only
        // hand-gathered parts keep raw supply now, so anything else still carrying it predates
        // the change. Recalculating is what turns the stored ledger into the truth.
        if (partData.isRaw && partData.amountSuppliedViaRaw > 0 && !handGathered.has(part)) {
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

      // Checklist mode: default the new per-factory fields for plans saved before it existed.
      if (factory.checklistEnabled === undefined) {
        factory.checklistEnabled = false
      }
      if (factory.checklistPanelHidden === undefined) {
        factory.checklistPanelHidden = false
      }
      if (factory.checklistExports === undefined) {
        factory.checklistExports = {}
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

      // Patch for #478
      if (factory.customBuildings === undefined) {
        factory.customBuildings = []
      }
      if (factory.syncStateCustomBuildings === undefined) {
        factory.syncStateCustomBuildings = {}
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

        // A group's type must match the item it hangs off. Plans exported from older builds
        // carry it wrong, and it is read all over the building group UI to decide which
        // controls to draw, so a mislabelled group renders the wrong editor.
        product.buildingGroups.forEach(group => {
          if (group.type !== ItemType.Product) {
            group.type = ItemType.Product
          }
        })
      })

      factory.powerProducers.forEach(producer => {
        producer.buildingGroups?.forEach(group => {
          if (group.type !== ItemType.Power) {
            group.type = ItemType.Power
          }
        })

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

    // Patch for #485. Runs after the shape migrations above, so it can rely on every
    // factory having its products, producers and building groups in place.
    const precision = repairPlanPrecision(newFactories, gameData)
    if (precision.repairs.length || precision.staleRecipeFigures) {
      console.log(
        `appStore: initFactories: Repaired ${precision.repairs.length} drifted quantities and ${precision.staleRecipeFigures} stale recipe figures`,
        precision.repairs
      )
      repairs.push(...precision.repairs)
      needsCalculation = true
    }

    if (repairs.length) {
      // Held for the dialog rather than emitted: a plan can be inited before the layout has
      // mounted its listeners (the factories getter inits on first read), and a repair the
      // user never sees reported is the thing we are trying to avoid.
      planRepairs.value = repairs
      // Repaired seeds and a repaired import/export chain both leave derived figures stale.
      needsCalculation = true
    }

    // Only recalculate when a data migration actually backfilled a missing field. A plan
    // whose derived data is already current — the common case, e.g. switching between tabs —
    // is stored fully calculated, so recalculating it is pure wasted work that blocks the main
    // thread (and blanks the screen) for several seconds on large plans. Callers that genuinely
    // need a recalc pass forceRecalc to setFactories or use forceCalculation. The 'recalculate'
    // origin treats the user's building groups as sacrosanct, so the backfill is safe.
    if (needsCalculation) {
      console.log('appStore: initFactories: Data migrations were applied, recalculating')
      calculateFactories(newFactories, gameDataStore.getGameData(), { origin: 'recalculate' })
    } else {
      // Whether a group set counts as balanced is the one stored verdict that depends on a
      // setting rather than on the plan, so a plan from another browser has to be re-judged
      // against this one's tolerance. Cheap enough to run on every load, unlike the recalc above.
      refreshBuildingGroupProblems(newFactories)
    }

    console.log('appStore: initFactories - completed')

    inited.value = true
    factories.value = newFactories // Also calls the watcher, which sets the current tab data.
    return factories.value
  }

  // The dialog reporting them has been shown — don't nag on the next tab switch.
  const dismissPlanRepairs = () => {
    planRepairs.value = []
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
    // newFactory() cannot see the plan, so its random ID may already be taken. A collision
    // makes the two factories indistinguishable to the dependency system, which keys every
    // export request by factory ID.
    if (factories.value.some(existing => existing.id === factory.id)) {
      const oldId = factory.id
      factory.id = generateFactoryId(factories.value)
      console.warn(`appStore: addFactory: Factory ID ${oldId} was already taken, reassigned to ${factory.id}`)
    }

    // A new factory is ungrouped, and ungrouped sorts to the top of the plan — so append it to
    // the end of the Ungrouped block rather than the end of the array, or the grouping sort
    // would immediately move it somewhere the user did not put it.
    const lastUngrouped = factories.value.findLastIndex(candidate => !candidate.group)
    factories.value.splice(lastUngrouped + 1, 0, factory)
    factories.value.forEach((entry, index) => {
      entry.displayOrder = index
    })
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
    // Memberless groups are the one piece of group state no factory carries, so clearing the
    // factories does not take them with it. Left behind, they outlive the plan they belonged to
    // and turn up in whatever is loaded next.
    const tab = getCurrentTab()
    if (tab) delete tab.groups
  }
  // ==== END FACTORY MANAGEMENT

  // ==== TAB MANAGEMENT
  const getTab = (id: string) => {
    return factoryTabs.value.find(tab => tab.id === id)
  }
  // A plan restored from the user's account. Clients up to v0.5 stored a bare Factory[]; from
  // v0.6 the whole tab is stored. An array is not old data to migrate — it is a client that has
  // not reloaded yet — so both shapes load, and an array is read as a plan from before the
  // change, which is exactly what it is.
  const loadServerPlan = (data: Factory[] | FactoryTab) => {
    // A restore is a load, and it bypasses the loader, so nothing else marks it as one. Without
    // this the work below announces every factory it touches while the app is still flagged
    // "loaded": cloud sync marks the account copy dirty and the next tick uploads the restored
    // plan straight back over the copy it just came from, before the user has answered anything.
    // Restored in a finally, because leaving it false switches syncing off for the session.
    const wasLoaded = isLoaded.value
    isLoaded.value = false

    try {
      if (Array.isArray(data)) {
        // A bare array was saved by v0.5 or earlier, so it predates the change by definition and
        // has to be asked about — including on a fresh machine, whose tab was born answered for
        // contents it no longer has.
        const legacyTab = getCurrentTab()
        if (legacyTab) {
          legacyTab.plannerVersion = undefined
        }
        // Recalculated, not trusted, and ONLY here. This array was written by a client that meant
        // something different by it - raw resources were assumed supplied - so its stored ledger
        // is the one thing that cannot be believed, and it is exactly what the notice below reads.
        setFactories(data, true)
        // Asked here too. A restore bypasses the loader, so loadingCompleted never fires and
        // nothing else calls this - the plan simply turned red with nothing on screen saying why.
        askRawBreakingNotice()
        return
      }

      const tab = getCurrentTab()
      if (tab) {
        // The name travels with the plan; the id does not. Restoring into a tab created on this
        // machine, its id is what local state is keyed by, while the name is what the user called
        // the plan when they saved it — so keeping the local one silently renamed their plan.
        if (data.name) tab.name = data.name
        tab.powerTarget = data.powerTarget
        tab.groups = data.groups
        tab.plannerVersion = data.plannerVersion
      }
      // Deliberately NOT forced here. This tab was written by a current client, so its quantities
      // are the user's own and its ledger means what it says. A forced recalculation treats
      // building groups as authoritative and writes them back over any item deliberately left out
      // of sync with its groups, which would quietly rewrite a restored plan.
      setFactories(data.factories ?? [])
      askRawBreakingNotice()
    } finally {
      isLoaded.value = wasLoaded
    }
  }

  const getCurrentTab = () => {
    return factoryTabs.value[currentFactoryTabIndex.value]
  }
  const getTabs = () => {
    return factoryTabs.value
  }

  const addTab = (tab: Partial<FactoryTab> = {}) => {
    const {
      id = crypto.randomUUID(),
      name = 'New Tab',
      factories = [],
      powerTarget,
      groups,
    } = tab

    factoryTabs.value.push({
      id,
      name,
      factories,
      // Preserve the plan's power target when importing a tab (e.g. from a share link) —
      // it describes the plan, not the browser.
      powerTarget,
      // And its memberless groups, which are the only ones no factory carries — a share link
      // that dropped them would arrive missing folders the sender could see.
      groups,
      // Same for the answer to the raw-resources change. `in` was meant to spot an imported plan
      // carrying no version, but it cannot: JSON.stringify drops an undefined key, so a genuine
      // pre-v0.6 plan arrives through a share link or the clipboard with the key simply absent
      // and looked identical to a brand-new tab — which stamped it answered and swallowed the
      // warning it needs. Its factories are what tell the two apart, the same rule the default
      // tab uses: a tab conjured out of nothing has never assumed a raw resource in its life.
      plannerVersion: tab.plannerVersion ?? (factories.length > 0 ? undefined : config.plannerVersion),
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
    const demoPlan = complexDemoPlan()
    // The power target lives on the tab — apply the demo's own target alongside
    // its factories.
    const tab = getCurrentTab()
    if (tab) {
      tab.powerTarget = demoPlan.powerTarget
    }
    prepareLoader(demoPlan.getFactories(), true)
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
    planRepairs,
    dismissPlanRepairs,
    getLastEdit,
    persistPlan,
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
    showRawBreakingNotice,
    askRawBreakingNotice,
    dismissRawBreakingNotice,
    deferRawBreakingNotice,
    loadServerPlan,
    rearmRawBreakingNotice,
    prepareLoader,
    forceCalculation,

    // Testing
    getTab,
    getCurrentTab,
    beginLoading,
    inited,
  }
})
