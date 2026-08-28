import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { PROTOCOL_VERSION } from 'common'
import { Factory, FactoryPowerChangeType, FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { setTabMirrorMeta, TAB_MIRROR_META_KEY } from '@/sync/tab-mirror-meta'
import { TAB_SYNC_STATE_KEY } from '@/sync/tab-sync-state'
import type { TabSyncState } from '@/sync/tab-sync-state'
import * as FactoryManager from '@/utils/factory-management/factory'
import { calculateFactory, newFactory } from '@/utils/factory-management/factory'
import * as FactoryValidate from '@/utils/factory-management/validation'
import { useAppStore } from '@/stores/app-store'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { createPinia, setActivePinia } from 'pinia'
import eventBus from '@/utils/eventBus'
import { useGameDataStore } from '@/stores/game-data-store'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { create485Scenario } from '@/utils/factory-setups/485-drifted-plan'

let appStore: ReturnType<typeof useAppStore>

const resetAppStore = (keepLocalStorage = false) => {
  if (!keepLocalStorage) {
    localStorage.removeItem('factoryTabs')
    localStorage.removeItem('preLoadFactories')
  }
  setActivePinia(createPinia())
  appStore = useAppStore()
}

describe('app-store', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()

    resetAppStore()
  })

  describe('initFactories', () => {
    let factories: Factory[]
    let factory: Factory
    beforeEach(() => {
      factory = newFactory('Foo')

      addProductToFactory(factory, {
        id: 'CopperIngot',
        amount: 1337,
        recipe: 'IngotCopper',
      })

      addPowerProducerToFactory(factory, {
        building: 'generatorfuel',
        buildingAmount: 5,
        recipe: 'GeneratorFuel_LiquidFuel',
        updated: FactoryPowerChangeType.Building,
      })

      factories = [factory]
      calculateFactory(factory, factories, gameData)
    })
    // #317 - broken plan loading from v0.2 data
    it('should initialize factories with missing powerProducer keys', () => {
      // Malform the object to remove the powerProducers key for test
      // @ts-ignore
      delete factory.powerProducers
      expect(factory.powerProducers).not.toBeDefined()

      appStore.initFactories(factories)

      expect(factory.powerProducers).toBeDefined()
    })
    it('#222: should initialize factories with missing sync data', () => {
      // @ts-ignore
      delete factory.inSync
      // @ts-ignore
      delete factory.syncState
      expect(factory.inSync).not.toBeDefined()
      expect(factory.syncState).not.toBeDefined()

      appStore.initFactories(factories)

      expect(factory.inSync).toBe(null)
      expect(factory.syncState).toBeDefined()
    })

    it('#244: should initialize factories with missing part data, and should recalculate it', () => {
      // Malform the part data
      // @ts-ignore
      factory.parts.CopperIngot.amountRequiredExports = undefined
      // @ts-ignore
      factory.parts.CopperIngot.amountRequiredProduction = undefined

      expect(factory.parts.CopperIngot.amountRequiredExports).not.toBeDefined()
      expect(factory.parts.CopperIngot.amountRequiredProduction).not.toBeDefined()

      // Initialize the factories
      appStore.initFactories(factories)

      // Should now be there
      expect(factory.parts.CopperIngot.amountRequiredExports).toBeDefined()
      expect(factory.parts.CopperIngot.amountRequiredProduction).toBeDefined()
    })

    it('#180: should initialize factories with missing part power and exportability data', () => {
      // @ts-ignore
      factory.parts.CopperIngot.amountRequiredPower = undefined
      // @ts-ignore
      factory.parts.CopperIngot.amountSuppliedViaRaw = undefined
      // @ts-ignore
      factory.parts.CopperIngot.exportable = undefined

      expect(factory.parts.CopperIngot.amountRequiredPower).not.toBeDefined()
      expect(factory.parts.CopperIngot.amountSuppliedViaRaw).not.toBeDefined()
      expect(factory.parts.CopperIngot.exportable).not.toBeDefined()

      appStore.initFactories(factories)

      expect(factory.parts.CopperIngot.amountRequiredPower).toBe(0)
      expect(factory.parts.CopperIngot.amountSuppliedViaRaw).toBe(0)
      expect(factory.parts.CopperIngot.exportable).toBe(true)
    })

    it('#431: should recalculate factories with double counted raw resource supply', () => {
      const oilFactory = newFactory('Consumer')
      addProductToFactory(oilFactory, {
        id: 'HeavyOilResidue',
        amount: 400,
        recipe: 'Alternate_HeavyOilResidue',
      })
      addProductToFactory(oilFactory, {
        id: 'LiquidOil',
        amount: 300,
        recipe: 'UnpackageOil',
      })
      const oilFactories = [oilFactory]
      calculateFactory(oilFactory, oilFactories, gameData)

      // Recreate the stale save data where the crude oil supplied by unpackaging was also
      // counted as supplied via raw extraction, showing a phantom 300 surplus.
      oilFactory.parts.LiquidOil.amountSuppliedViaRaw = 300
      oilFactory.parts.LiquidOil.amountSupplied = 600
      oilFactory.parts.LiquidOil.amountRemaining = 300
      oilFactory.rawResources.LiquidOil = { id: 'LiquidOil', name: 'Crude Oil', amount: 300 }

      appStore.initFactories(oilFactories)

      // The migration should have detected the over-supply and recalculated
      expect(oilFactory.parts.LiquidOil.amountSuppliedViaRaw).toBe(0)
      expect(oilFactory.parts.LiquidOil.amountSupplied).toBe(300)
      expect(oilFactory.parts.LiquidOil.amountRemaining).toBe(0)
      expect(oilFactory.rawResources.LiquidOil).toBeUndefined()
    })

    it('#180: should initialize factories with missing power data', () => {
      // @ts-ignore
      delete factory.powerProducers
      expect(factory.powerProducers).not.toBeDefined()

      // @ts-ignore
      delete factory.power
      expect(factory.power).not.toBeDefined()

      appStore.initFactories(factories)

      expect(factory.powerProducers).toBeDefined()
      expect(factory.power).toBeDefined()
    })

    // A factory added but never calculated was persisted with `power: {}`. The sync
    // schema now fills those totals rather than rejecting the factory, and the mirror
    // has to agree with what the server stores, so init zeroes them too.
    it('should backfill the power totals of a factory that was never calculated', () => {
      factory.power = {} as typeof factory.power
      const spy = vi.spyOn(FactoryManager, 'calculateFactories')

      appStore.initFactories(factories)

      expect(factory.power.consumed).toBeDefined()
      expect(factory.power.produced).toBeDefined()
      expect(factory.power.difference).toBeDefined()
      expect(spy).toHaveBeenCalled()
    })

    it('should initialize factories with missing previous inputs data', () => {
      // @ts-ignore
      delete factory.previousInputs
      expect(factory.previousInputs).not.toBeDefined()

      appStore.initFactories(factories)

      expect(factory.previousInputs).toBeDefined()
    })

    it('#250: should initialize factories with missing note data', () => {
      // @ts-ignore
      delete factory.notes
      expect(factory.notes).not.toBeDefined()

      appStore.initFactories(factories)

      expect(factory.notes).toBeDefined()
    })

    it('#250: should initialize factories with missing task data', () => {
      // @ts-ignore
      delete factory.tasks
      expect(factory.tasks).not.toBeDefined()

      appStore.initFactories(factories)

      expect(factory.tasks).toBeDefined()
    })

    it('should generate a data version', () => {
      appStore.initFactories(factories)
      expect(factory.dataVersion).toBeDefined()
    })

    it('should call calculateFactories when required', () => {
      // Trigger a recalculation
      // @ts-ignore
      factory.power = undefined

      // Spy on the calculateFactories function
      const spy = vi.spyOn(FactoryManager, 'calculateFactories')

      appStore.initFactories(factories)

      expect(spy).toHaveBeenCalled()
    })
    it('should use the group-preserving recalculate origin when a migration triggers a recalc', () => {
      // When a migration backfills a missing field the recalc must run with the 'recalculate'
      // origin, which treats the user's building groups as sacrosanct.
      // @ts-ignore - force a migration to trigger the recalc
      factory.power = undefined
      const spy = vi.spyOn(FactoryManager, 'calculateFactories')

      appStore.initFactories(factories)

      expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), { origin: 'recalculate' })
    })

    it('should NOT call calculateFactories when the plan is already fully calculated', () => {
      // A plan whose derived data is already current (e.g. switching between tabs) is stored
      // fully calculated. Recalculating it is wasted work that blanks the screen, so init skips it.
      const spy = vi.spyOn(FactoryManager, 'calculateFactories')

      appStore.initFactories(factories)

      expect(spy).not.toHaveBeenCalled()
    })

    it('should show an alert if the factories did not validate', () => {
      const message = 'Error validating factories!'
      const error = new Error(message)
      // Mock validateFactories failing
      vi.spyOn(window, 'alert').mockImplementation(() => {})
      vi.spyOn(console, 'error')
      vi.spyOn(FactoryValidate, 'validateFactories').mockImplementation(() => {
        throw new Error(message)
      })

      appStore.initFactories(factories)

      // Expect console.error to have been called
      expect(console.error).toHaveBeenCalledWith('appStore: initFactories: Error validating factories:', error)

      // Expect alerto to have thrown
      expect(window.alert).toHaveBeenCalledWith('Error validating factories: ' + error.message)
    })

    describe('building groups', () => {
      it('should ensure factories have product building groups and it has initialized it correctly when undefined', () => {
      // @ts-ignore
        factory.products[0].buildingGroups = undefined

        appStore.initFactories(factories)

        const buildingGroup = factory.products[0].buildingGroups[0]
        expect(buildingGroup).toBeDefined()
        expect(buildingGroup.buildingCount).toBe(45)
        expect(buildingGroup.overclockPercent).toBe(99.037)
        expect(factory.products[0].buildingGroupsHaveProblem).toBe(false)
        expect(factory.products[0].buildingGroupsTrayOpen).toBe(false)
      })

      it('should ensure factories have product building groups and it has initialized it correctly when on an empty array', () => {
      // @ts-ignore
        factory.products[0].buildingGroups = []

        appStore.initFactories(factories)

        const buildingGroup = factory.products[0].buildingGroups[0]
        expect(buildingGroup).toBeDefined()
        expect(buildingGroup.buildingCount).toBe(45)
        expect(buildingGroup.overclockPercent).toBe(99.037)
        expect(factory.products[0].buildingGroupsHaveProblem).toBe(false)
        expect(factory.products[0].buildingGroupsTrayOpen).toBe(false)
      })

      it('should ensure factories have power producer building groups and it has initialized it correctly when undefined', () => {
      // @ts-ignore
        factory.powerProducers[0].buildingGroups = undefined

        appStore.initFactories(factories)

        const producer = factory.powerProducers[0]
        const buildingGroup = producer.buildingGroups[0]
        expect(buildingGroup.buildingCount).toBe(5)
        expect(producer.buildingGroupsTrayOpen).toBe(false)
      })

      it('should ensure factories have power producer building groups and it has initialized it correctly with a blank array', () => {
      // @ts-ignore
        factory.powerProducers[0].buildingGroups = []

        appStore.initFactories(factories)

        const producer = factory.powerProducers[0]
        const buildingGroup = producer.buildingGroups[0]
        expect(buildingGroup).toBeDefined()
        expect(buildingGroup.buildingCount).toBe(5)
        expect(producer.buildingGroupsTrayOpen).toBe(false)
      })
    })

    it('should add id to powerProducers', () => {
      // @ts-ignore
      delete factory.powerProducers[0].id

      appStore.initFactories(factories)

      expect(factory.powerProducers[0].id).toBeDefined()
    })

    it('should add buildingGroupsHaveProblem to power producers', () => {
      // @ts-ignore
      delete factory.powerProducers[0].buildingGroupsHaveProblem

      appStore.initFactories(factories)

      expect(factory.powerProducers[0].buildingGroupsHaveProblem).toBeDefined()
    })

    it('should add buildingGroupsHaveProblem to products', () => {
      // @ts-ignore
      delete factory.products[0].buildingGroupsHaveProblem

      appStore.initFactories(factories)

      expect(factory.products[0].buildingGroupsHaveProblem).toBeDefined()
    })

    // Patch for #485 — a saved plan holding 2400.002 where it means 2400 is repaired on
    // load, and the repair forces the recalculation that clears the derived figures too.
    describe('rounding drift repair', () => {
      it('should load the plan from #485 with every Rocket Fuel figure whole', () => {
        const drifted = create485Scenario()

        appStore.initFactories(drifted)

        const producer = drifted[0].powerProducers[0]
        expect(producer.fuelAmount).toBe(2400)
        expect(producer.ingredients[0].perMin).toBe(2400)
        expect(producer.ingredients[0].mwPerItem).toBe(60)
        expect(producer.buildingGroups[0].parts.RocketFuel).toBe(2400)
        expect(drifted[0].parts.RocketFuel.amountRequired).toBe(2400)
        expect(drifted[0].parts.RocketFuel.amountRemaining).toBe(-2400)
      })

      it('should recalculate a plan it repaired', () => {
        const spy = vi.spyOn(FactoryManager, 'calculateFactories')

        appStore.initFactories(create485Scenario())

        expect(spy).toHaveBeenCalled()
      })

      it('should not recalculate a plan that needs no repair', () => {
        const spy = vi.spyOn(FactoryManager, 'calculateFactories')
        const clean = create485Scenario()
        appStore.initFactories(clean)
        spy.mockClear()

        appStore.initFactories(clean)

        expect(spy).not.toHaveBeenCalled()
      })
    })
  })

  describe('loading process', () => {
    beforeEach(() => {
      vi.spyOn(eventBus, 'emit')
      appStore.getFactories() // Init the state
    })

    describe('prepareLoader', () => {
      it('should leave isLoaded false while a staggered load is still pending', async () => {
        await appStore.prepareLoader([newFactory('Foo')], true)
        expect(appStore.isLoaded).toBe(false)
      })

      it('should emit the plannerShow,false event', async () => {
        await appStore.prepareLoader()
        expect(eventBus.emit).toHaveBeenCalledWith('plannerShow', false)
      })

      it('should set the factories as expected if supplied', async () => {
        const factory = newFactory('Foo')
        const factory2 = newFactory('Foo2')

        await appStore.prepareLoader([factory, factory2])

        expect(appStore.getFactories()).toEqual([factory, factory2])
      })

      it('should set the factories as expected if supplied with force load', async () => {
        const factory = newFactory('Foo')
        const factory2 = newFactory('Foo2')

        await appStore.prepareLoader([factory, factory2])

        expect(appStore.getFactories()).toEqual([factory, factory2])
      })

      it('should emit the prepareForLoad event with the correct info', async () => {
        const factory = newFactory('Foo')
        const factory2 = newFactory('Foo2')
        factory2.hidden = true

        await appStore.prepareLoader([factory, factory2], true)

        expect(eventBus.emit).toHaveBeenCalledWith('prepareForLoad', {
          count: 2,
          shown: 1,
        })
      })

      // The stagger paces the render of a whole plan and is only worth its cost when
      // something was calculated. An already-calculated plan renders straight through.
      describe('loader gating', () => {
        let factories: Factory[]

        beforeEach(() => {
          factories = [newFactory('Foo'), newFactory('Foo2')]
          vi.mocked(eventBus.emit).mockClear()
        })

        it('should not open the loader when nothing was calculated', async () => {
          await appStore.prepareLoader(factories)

          expect(eventBus.emit).not.toHaveBeenCalledWith('prepareForLoad', expect.any(Object))
          expect(eventBus.emit).toHaveBeenCalledWith('loadingCompleted')
          expect(appStore.isLoaded).toBe(true)
          expect(appStore.getFactories()).toEqual(factories)
        })

        it('should open the loader when a recalculation was forced', async () => {
          await appStore.prepareLoader(factories, true)

          expect(eventBus.emit).toHaveBeenCalledWith('prepareForLoad', { count: 2, shown: 2 })
        })

        it('should open the loader when a data migration had to calculate', async () => {
          const migrated = newFactory('Migrated')
          // #180's backfill: a missing powerProducers array forces a recalculation.
          // @ts-ignore
          delete migrated.powerProducers

          await appStore.prepareLoader([migrated])

          expect(eventBus.emit).toHaveBeenCalledWith('prepareForLoad', { count: 1, shown: 1 })
        })

        it('should take the full path when a previous load was interrupted', async () => {
          localStorage.setItem('preLoadFactories', JSON.stringify([newFactory('Recovered')]))

          await appStore.prepareLoader(factories)

          expect(eventBus.emit).toHaveBeenCalledWith('prepareForLoad', { count: 2, shown: 2 })
          localStorage.removeItem('preLoadFactories')
        })

        // Completing synchronously is the proof: the staggered path is async, so it
        // could not have finished by the time the call returns.
        it('should render straight through when the loader asks and nothing was calculated', async () => {
          await appStore.prepareLoader(factories)
          appStore.isLoaded = false

          appStore.startQueuedLoad()

          expect(appStore.isLoaded).toBe(true)
        })

        it('should stagger when the loader asks and a recalculation was forced', async () => {
          await appStore.prepareLoader(factories, true)
          appStore.isLoaded = false

          appStore.startQueuedLoad()

          expect(appStore.isLoaded).toBe(false)
        })
      })

      describe('beginLoading', () => {
        let factories: Factory[]

        beforeEach(async () => {
          vi.spyOn(eventBus, 'emit')
          const factory = newFactory('Foo')
          const factory2 = newFactory('Foo2')
          factories = [factory, factory2]
          // Forced, so the loader gate lets the staggered path run.
          await appStore.prepareLoader(factories, true)
        })

        it('should load another list of factories if preLoadFactories contains them', async () => {
          // Set up prepareForLoad event spy
          const mockFailedFactories = [
            newFactory('Bar'),
          ]
          localStorage.setItem('preLoadFactories', JSON.stringify(mockFailedFactories))

          // Re-call the loading process as we've set the localStorage above.
          await appStore.beginLoading(factories)

          expect(eventBus.emit).toHaveBeenCalledWith('toast', {
            message: 'Unsuccessful load detected, loading previous factory data.',
            type: 'warning',
          })
          expect(eventBus.emit).toHaveBeenCalledWith('prepareForLoad', {
            count: 1, // Not 2 as per the beforeEach
            shown: 1,
          })
        })

        it('should emit the prepareForLoad event with the correct info', async () => {
          eventBus.emit('readyForData') // Which calls beginLoading

          expect(eventBus.emit).toHaveBeenCalledWith('prepareForLoad', {
            count: 2,
            shown: 2,
          })
        })
      })

      it('should finish early if there are no factories to load', async () => {
        // Clear emissions recorded during state init: since Vitest 3, resetAllMocks
        // restores the real eventBus.emit, so init-time events land in the history.
        vi.spyOn(eventBus, 'emit').mockClear()

        await appStore.beginLoading([])

        expect(eventBus.emit).toHaveBeenCalledWith('loadingCompleted')
        expect(eventBus.emit).not.toHaveBeenCalledWith('prepareForLoad', expect.any(Object))
        expect(appStore.getFactories()).toEqual([])
      })

      describe('loadNextFactory', () => {
        let factories: Factory[]
        const mockFailedFactories = [
          newFactory('Bar'),
        ]
        beforeEach(async () => {
          // Set up incrementLoad event spy
          vi.spyOn(eventBus, 'emit')

          const factory = newFactory('Foo')
          const factory2 = newFactory('Foo2')
          factories = [factory, factory2]
        })
        afterEach(() => {
          // Reset the spy
          vi.resetAllMocks()
          localStorage.removeItem('preLoadFactories')
        })

        it('should have loaded the correct number of factories', async () => {
          await appStore.prepareLoader(factories)

          await appStore.beginLoading(factories)

          expect(appStore.getFactories()).toEqual(factories)
        })

        it('should have loaded the correct number of factories given preLoadFactories', async () => {
          localStorage.setItem('preLoadFactories', JSON.stringify(mockFailedFactories))
          await appStore.prepareLoader(factories)

          await appStore.beginLoading(factories)

          // Check the resulting data
          expect(appStore.getFactories()).toEqual(mockFailedFactories)

          // Check if the local storage item was removed
          expect(localStorage.getItem('preLoadFactories')).toBe(null)
        })

        it('should have emitted the incrementLoad,increment event the correct number of times', async () => {
          // Only count emissions from the load flow itself, not from state init
          vi.mocked(eventBus.emit).mockClear()
          await appStore.prepareLoader(factories)

          await appStore.beginLoading(factories)

          // Fresh factories need no migration, so prepareLoader's gate renders straight
          // through. The 7 events are: plannerShow(false) and loadingCompleted from
          // prepareLoader, then prepareForLoad, incrementLoad ×2 (one per factory), the
          // render increment and loadingCompleted from the explicit beginLoading.
          // Annoyingly we can't check the payload.
          expect(eventBus.emit).toHaveBeenCalledTimes(7)
          expect(eventBus.emit).toHaveBeenCalledWith('incrementLoad', {
            step: 'increment',
          })
        })

        it('should have emitted the loadingCompleted event', async () => {
          await appStore.prepareLoader(factories)

          await appStore.beginLoading(factories)

          expect(eventBus.emit).toHaveBeenCalledWith('loadingCompleted')
        })
      })
    })
  })

  describe('factory management', () => {
    describe('getFactories', () => {
      beforeEach(async () => {
        // Reset the app store each time
        resetAppStore(false)

        // Initialize the state or things go terribly wrong
        appStore.getFactories()
      })
      afterEach(() => {
        vi.resetAllMocks()
      })

      it('should return empty if the current tab is empty / not present', async () => {
        expect(appStore.getFactories()).toEqual([])
      })

      it('should return empty array if the currentFactoryTab is not defined', () => {
        // @ts-ignore
        appStore.currentFactoryTab = undefined
        expect(appStore.getFactories()).toEqual([])
      })

      it('should return the factories from the current tab', () => {
        // Add a factory
        const factory = newFactory('Foobarbaz')
        appStore.addFactory(factory)
        expect(appStore.getFactories()).toEqual([factory])
      })

      it('should emit prepareForLoad if the state is not inited', async () => {
        appStore.inited = false
        vi.spyOn(eventBus, 'emit')

        appStore.getFactories()

        // Wait for reactivity
        await new Promise(resolve => setTimeout(resolve, 100))

        expect(eventBus.emit).toHaveBeenCalledWith('prepareForLoad', {
          // There should be no factories to load as it's a blank state
          count: 0,
          shown: 0,
        })
      })

      it('should NOT emit prepareForLoad if the state is inited', async () => {
        appStore.getFactories() // Init the state

        // Wait a bit for the state to load
        await new Promise(resolve => setTimeout(resolve, 100))

        // Start spying, discarding anything the init above already emitted
        vi.spyOn(eventBus, 'emit').mockClear()

        // Call it again, at this point it should be inited
        appStore.getFactories()

        // Meaning this should not have fired
        expect(eventBus.emit).not.toHaveBeenCalledWith('prepareForLoad', expect.any(Object))
      })
    })

    describe('setFactories', () => {
      it('should throw if the game data does not exist', () => {
        // Mock the gameData store
        const mockGameStore = useGameDataStore()
        mockGameStore.getGameData = vi.fn().mockImplementation(() => null)

        expect(() => appStore.setFactories([])).toThrow('factories: setFactories: gameData does not exist!')
      })

      it('should run the calculations if told to', () => {
        const factories = [newFactory('Foo')]
        const spy = vi.spyOn(FactoryManager, 'calculateFactories')
        appStore.setFactories(factories, true)

        expect(spy).toHaveBeenCalled()
      })

      it('should replace the factories with the new ones', () => {
        const newFactories = [newFactory('Foo'), newFactory('Bar')]
        appStore.setFactories(newFactories)

        expect(appStore.getFactories()).toEqual(newFactories)
      })
    })

    describe('addFactory', () => {
      beforeEach(() => {
      // Reset the app store each time
        resetAppStore()

        // Init the factories
        appStore.getFactories()
      })
      it('should add a factory to the current tab', async () => {
      // The current tab is empty
        const factory = newFactory('Foobarbaz')
        appStore.addFactory(factory)

        expect(appStore.getFactories()).toEqual([factory])
      })

      it('should add a factory to the current tab with the correct display order', async () => {
      // The current tab is empty, populate it with factories
        const factory = newFactory('Foobarbaz')
        const factory2 = newFactory('Foobarbaz2')
        appStore.addFactory(factory)
        appStore.addFactory(factory2)

        const factories = appStore.getFactories()
        expect(factories).toEqual([factory, factory2])
        expect(factories[0].displayOrder).toEqual(0)
        expect(factories[1].displayOrder).toEqual(1)
      })
    })

    describe('removeFactory', () => {
      beforeEach(() => {
      // Reset the app store each time
        resetAppStore()

        // Init the factories
        appStore.getFactories()
      })
      it('should remove a factory from the current tab', async () => {
      // The current tab is empty
        const factory = newFactory('Foobarbaz')
        appStore.addFactory(factory)

        // Remove the factory
        appStore.removeFactory(factory.id)

        expect(appStore.getFactories()).toEqual([])
      })

      it('should remove a factory from the current tab and maintain display orders', async () => {
      // Add 3 factories
        const factory = newFactory('Dont delete me 1', 123)
        const factory2 = newFactory('Delete me 2', 256)
        const factory3 = newFactory('Dont delete me 3', 678)
        appStore.addFactory(factory)
        appStore.addFactory(factory2)
        appStore.addFactory(factory3)

        // Remove factory 2 so the orders are out of sync
        appStore.removeFactory(factory2.id)

        // Check the display orders
        const factories = appStore.getFactories()
        expect(factories[0].displayOrder).toEqual(0)
        expect(factories[1].displayOrder).toEqual(1)
      })
    })

    describe('clearFactories', () => {
      it('should flush all factories', () => {
        const factory = newFactory('Foobarbaz')
        appStore.addFactory(factory)

        appStore.clearFactories()

        expect(appStore.getFactories()).toEqual([])
      })
    })
  })

  describe('tab management', () => {
    describe('addTab', () => {
      it('should add a new tab and the planner has switched to it ', () => {
        const newTab: FactoryTab = {
          id: '12345',
          name: 'New Tab',
          factories: [],
        }
        appStore.addTab(newTab)

        // Expect the new tab in the list
        expect(appStore.getTab(newTab.id)).toBeDefined()

        // Expect the current tab to be the newly created tab
        expect(appStore.currentFactoryTabIndex).toBe(1)
        expect(appStore.getCurrentTab().id).toBe(newTab.id)
      })

      it('should preserve the power target when importing a tab', () => {
        const newTab: FactoryTab = {
          id: '67890',
          name: 'Imported Tab',
          factories: [],
          powerTarget: 5000,
        }
        appStore.addTab(newTab)

        expect(appStore.getCurrentTab().powerTarget).toBe(5000)
      })
    })
    describe('reorderTabs', () => {
      const threeTabs = () => {
        appStore.addTab({ id: 'b', name: 'B', factories: [] }, { activate: false })
        appStore.addTab({ id: 'c', name: 'C', factories: [] }, { activate: false })
        return [appStore.getTabs()[0].id, 'b', 'c']
      }

      it('should lay the bar out in the order given', () => {
        const [first] = threeTabs()

        expect(appStore.reorderTabs(['c', first, 'b'])).toBe(true)
        expect(appStore.getTabs().map(tab => tab.id)).toEqual(['c', first, 'b'])
      })

      it('should keep the tab on screen on screen, at its new index', () => {
        const [first] = threeTabs()
        appStore.activateTab('b')

        appStore.reorderTabs(['b', 'c', first])

        expect(appStore.currentFactoryTabIndex).toBe(0)
        expect(appStore.getCurrentTab().id).toBe('b')
      })

      it('should persist the new order to the plan mirror', () => {
        const [first] = threeTabs()
        vi.useFakeTimers()

        appStore.reorderTabs(['c', 'b', first])
        vi.runAllTimers()
        vi.useRealTimers()

        const stored = JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as FactoryTab[]
        expect(stored.map(tab => tab.id)).toEqual(['c', 'b', first])
      })

      // The index watcher drives the loader, and a reorder moves the index without
      // changing what is rendered.
      it('should not reload the plan the moved tab is already showing', async () => {
        threeTabs()
        appStore.activateTab('b')
        await nextTick()

        // eventBus may already be spied by an earlier test, and spyOn hands back that
        // same mock: only a clear separates the switch's emits from the reorder's.
        const emit = vi.spyOn(eventBus, 'emit')
        emit.mockClear()

        appStore.reorderTabs(['b', 'c', appStore.getTabs()[0].id])
        await nextTick()

        expect(emit).not.toHaveBeenCalledWith('plannerShow', false)
      })

      it('should refuse a partial, padded or duplicated order and change nothing', () => {
        const [first] = threeTabs()
        const before = appStore.getTabs().map(tab => tab.id)

        expect(appStore.reorderTabs(['c', 'b'])).toBe(false)
        expect(appStore.reorderTabs(['c', 'b', first, 'ghost'])).toBe(false)
        expect(appStore.reorderTabs(['b', 'b', 'c'])).toBe(false)
        expect(appStore.getTabs().map(tab => tab.id)).toEqual(before)
      })
    })

    describe('removeCurrentTab', () => {
      beforeEach(() => {
        // Reset the app store each time
        resetAppStore()
      })
      it('should NOT remove the current tab if it is the only one', () => {
        const currentTabId = appStore.currentFactoryTabIndex
        appStore.removeCurrentTab()
        expect(appStore.getTabs()[currentTabId]).toBeDefined()
      })

      it('should remove the current tab if there is more than one', () => {
        const originalTab = JSON.parse(JSON.stringify(appStore.getCurrentTab()))

        // Adding a tab changes the current tab index.
        appStore.addTab({
          id: '12345',
          name: 'New Tab',
          factories: [],
        })
        vi.spyOn(eventBus, 'emit')

        // We are therefore removing the tab we just created
        appStore.removeCurrentTab()

        expect(appStore.getTab('12345')).toBeUndefined()
        // Expect the old tab to still exist
        expect(appStore.getCurrentTab()).toEqual(originalTab)
      })
    })
  })

  describe('tab lifecycle', () => {
    beforeEach(() => {
      localStorage.removeItem(TAB_SYNC_STATE_KEY)
      localStorage.removeItem(TAB_MIRROR_META_KEY)
      resetAppStore()
    })

    const syncedState = (revision: number, overrides: Partial<TabSyncState> = {}) => ({
      kind: 'synced' as const,
      shared: false,
      role: 'owner' as const,
      revision,
      ...overrides,
    })

    it('should treat an unknown tab as local', () => {
      expect(appStore.getTabState('nope')).toEqual({
        kind: 'local',
        shared: false,
        role: 'owner',
        revision: null,
      })
    })

    it('should move a tab from local to synced and persist it outside factoryTabs', () => {
      const tab = appStore.getCurrentTab()

      appStore.setTabState(tab.id, syncedState(3))

      expect(appStore.getTabState(tab.id).kind).toBe('synced')
      expect(JSON.parse(localStorage.getItem(TAB_SYNC_STATE_KEY) ?? '{}')[tab.id].revision).toBe(3)
      // The mirror keeps today's exact shape — nothing about sync leaks into what
      // persistPlan writes, which is what makes a v6 rollback land on readable data.
      expect(Object.keys(JSON.parse(JSON.stringify(tab)))).toEqual(['id', 'name', 'factories'])
    })

    it('should convert a revoked tab back to local without touching its content', () => {
      const tab = appStore.getCurrentTab()
      tab.factories.push(newFactory('Kept'))
      appStore.setTabState(tab.id, syncedState(3, { shared: true }))

      appStore.markTabLocal(tab.id)

      expect(appStore.getTabState(tab.id).kind).toBe('local')
      expect(appStore.getTab(tab.id)?.factories.map(f => f.name)).toEqual(['Kept'])
    })

    it('should carry the sync state across a re-key', () => {
      const tab = appStore.getCurrentTab()
      const originalId = tab.id
      appStore.setTabState(originalId, syncedState(7))

      expect(appStore.rekeyTab(originalId, 'fresh-id')).toBe(true)

      expect(appStore.getTab('fresh-id')).toBeDefined()
      expect(appStore.getTabState('fresh-id').revision).toBe(7)
      expect(appStore.getTabState(originalId).kind).toBe('local')
    })

    it('should refuse to re-key onto an id another tab already holds', () => {
      const tab = appStore.getCurrentTab()
      appStore.addTab({ id: 'taken', name: 'Other', factories: [] })

      expect(appStore.rekeyTab(tab.id, 'taken')).toBe(false)
    })

    it('should not switch to a tab the room list brought in', () => {
      const before = appStore.currentFactoryTabIndex

      appStore.addTab({ id: 'remote', name: 'Remote', factories: [] }, { activate: false })

      expect(appStore.currentFactoryTabIndex).toBe(before)
      expect(appStore.getTab('remote')).toBeDefined()
    })

    it('should duplicate a tab as an independent local copy', () => {
      const tab = appStore.getCurrentTab()
      tab.factories.push(newFactory('Original'))
      appStore.setTabState(tab.id, syncedState(2, { shared: true }))

      const copyId = appStore.duplicateTab(tab.id) as string
      appStore.getTab(copyId)!.factories[0].name = 'Changed'

      expect(appStore.getTab(copyId)?.name).toBe(`${tab.name} (local)`)
      expect(appStore.getTabState(copyId).kind).toBe('local')
      expect(tab.factories[0].name).toBe('Original')
    })

    it('should drop state for tabs the bar no longer holds', () => {
      appStore.setTabState('ghost', syncedState(1))

      appStore.pruneTabStates()

      expect(appStore.getTabState('ghost').kind).toBe('local')
    })

    describe('instant render gating', () => {
      const mirrorAt = (tabId: string, revision: number, appVersion = PROTOCOL_VERSION) => {
        setTabMirrorMeta(tabId, { revision, appVersion, userTouchedIds: [], userTouchedFields: [] })
      }

      it('should render instantly when the mirror matches the server revision', () => {
        const tab = appStore.getCurrentTab()
        appStore.setTabState(tab.id, syncedState(4))
        mirrorAt(tab.id, 4)

        expect(appStore.canRenderInstantly(tab.id)).toBe(true)
      })

      it('should not render instantly when the mirror is behind the server', () => {
        const tab = appStore.getCurrentTab()
        appStore.setTabState(tab.id, syncedState(5))
        mirrorAt(tab.id, 4)

        expect(appStore.canRenderInstantly(tab.id)).toBe(false)
      })

      it('should not render instantly when the mirror was written by another app version', () => {
        const tab = appStore.getCurrentTab()
        appStore.setTabState(tab.id, syncedState(4))
        mirrorAt(tab.id, 4, '6.9')

        expect(appStore.canRenderInstantly(tab.id)).toBe(false)
      })

      it('should never render a local tab instantly', () => {
        const tab = appStore.getCurrentTab()
        mirrorAt(tab.id, 4)

        expect(appStore.canRenderInstantly(tab.id)).toBe(false)
      })

      it('should not render instantly when a previous load was interrupted', () => {
        const tab = appStore.getCurrentTab()
        appStore.setTabState(tab.id, syncedState(4))
        mirrorAt(tab.id, 4)
        localStorage.setItem('preLoadFactories', JSON.stringify([newFactory('Recovered')]))

        expect(appStore.canRenderInstantly(tab.id)).toBe(false)

        localStorage.removeItem('preLoadFactories')
      })
    })

    describe('reloadTabFromMirror', () => {
      it('should push server-applied data through the loader funnel', async () => {
        const tab = appStore.getCurrentTab()
        appStore.getFactories()
        vi.spyOn(eventBus, 'emit')
        // Whole records arriving from the server, exactly as a snapshot leaves them.
        tab.factories = [newFactory('From the server')]

        await appStore.reloadTabFromMirror(tab.id)

        expect(eventBus.emit).toHaveBeenCalledWith('plannerShow', false)
        expect(appStore.getFactories().map(f => f.name)).toEqual(['From the server'])
      })

      it('should leave a background tab alone until it is selected', async () => {
        appStore.addTab({ id: 'background', name: 'Background', factories: [] }, { activate: false })
        vi.spyOn(eventBus, 'emit')

        await appStore.reloadTabFromMirror('background')

        expect(eventBus.emit).not.toHaveBeenCalledWith('plannerShow', false)
      })
    })
  })
})
