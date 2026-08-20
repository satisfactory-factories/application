import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory, FactoryPowerChangeType, FactoryTab, LegacyRawAssumptionFields } from '@/interfaces/planner/FactoryInterface'
import * as FactoryManager from '@/utils/factory-management/factory'
import { calculateFactories, calculateFactory, newFactory } from '@/utils/factory-management/factory'
import * as FactoryValidate from '@/utils/factory-management/validation'
import { useAppStore } from '@/stores/app-store'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { createPinia, setActivePinia } from 'pinia'
import eventBus from '@/utils/eventBus'
import { useGameDataStore } from '@/stores/game-data-store'
import { config } from '@/config/config'
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

    it('#503: should recalculate a plan saved before raw resources became real shortages', () => {
      const smelter = newFactory('Smelter')
      addProductToFactory(smelter, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
      const plan = [smelter]
      calculateFactory(smelter, plan, gameData)

      // v0.6 leaves an unmined ore short. Recreate what v0.5 stored instead: the planner
      // supplied the shortfall itself, so the ledger reads fully satisfied.
      const ore = smelter.parts.OreIron
      expect(ore.satisfied).toBe(false) // guards the premise: v0.6 really does leave it short
      ore.amountSuppliedViaRaw = ore.amountRequired
      ore.amountSupplied = ore.amountRequired
      ore.amountRemaining = 0
      ore.satisfied = true
      smelter.requirementsSatisfied = true
      smelter.hasProblem = false

      appStore.initFactories(plan)

      // Without the recalculation the stale ledger survives, the factory stays green, and the
      // breaking-change notice and wizard both find nothing to do.
      expect(smelter.parts.OreIron.amountSuppliedViaRaw).toBe(0)
      expect(smelter.parts.OreIron.amountRemaining).toBe(-100)
      expect(smelter.parts.OreIron.satisfied).toBe(false)
      expect(smelter.requirementsSatisfied).toBe(false)
    })

    it('#503: should leave a hand-gathered resource alone', () => {
      const factory = newFactory('Biomass')
      addProductToFactory(factory, { id: 'Biomass', amount: 100, recipe: 'Biomass_Leaves' })
      const plan = [factory]
      calculateFactory(factory, plan, gameData)

      // Leaves have no extractor, so v0.6 still supplies them. Nothing to migrate.
      expect(factory.parts.Leaves.amountSuppliedViaRaw).toBeGreaterThan(0)
      expect(factory.parts.Leaves.satisfied).toBe(true)

      appStore.initFactories(plan)

      expect(factory.parts.Leaves.satisfied).toBe(true)
      expect(factory.parts.Leaves.amountSuppliedViaRaw).toBeGreaterThan(0)
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
      it('set the isLoaded value to false', async () => {
        await appStore.prepareLoader()
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

        await appStore.prepareLoader([factory, factory2])

        expect(eventBus.emit).toHaveBeenCalledWith('prepareForLoad', {
          count: 2,
          shown: 1,
        })
      })

      describe('beginLoading', () => {
        let factories: Factory[]

        beforeEach(async () => {
          vi.spyOn(eventBus, 'emit')
          const factory = newFactory('Foo')
          const factory2 = newFactory('Foo2')
          factories = [factory, factory2]
          await appStore.prepareLoader(factories)
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

          // Fresh factories need no migration, so no recalc fires. The 7 events are:
          // plannerShow(false), prepareForLoad ×2, incrementLoad ×2 (one per factory),
          // the render increment, and loadingCompleted. Annoyingly we can't check the payload.
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

  describe('raw resources breaking-change notice', () => {
    beforeEach(() => {
      resetAppStore()
    })

    // A plan short of a raw resource nothing digs up: exactly what a plan built before
    // extraction existed looks like once it is loaded.
    const unmigratedPlan = () => {
      const factory = newFactory('Old Plan')
      addProductToFactory(factory, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
      return [factory]
    }

    const loadAsLegacyPlan = async (factories: Factory[]) => {
      const tab = appStore.getCurrentTab()
      if (tab) delete tab.plannerVersion
      appStore.setFactories(factories, true)
      await appStore.beginLoading(factories)
    }

    it('raises the notice for a plan that predates the change', async () => {
      await loadAsLegacyPlan(unmigratedPlan())

      expect(appStore.showRawBreakingNotice).toBe(true)
    })

    // loadingCompleted schedules a debounced write 500ms out and then flips isLoaded true. A direct
    // flush landing inside that window - the 5s interval, a tab switch, closing the tab - would see
    // a loaded app, cancel the pending load-origin write, and stamp the migration as a user edit.
    // checkForOOS reads that timestamp to decide whether the account copy is stale.
    it('does not stamp lastEdit when a direct flush lands just after a load finishes', async () => {
      const before = new Date('2020-01-01T00:00:00Z')
      localStorage.setItem('lastEdit', before.toISOString())
      resetAppStore(true)

      await appStore.beginLoading(unmigratedPlan())

      // What the interval, visibilitychange and pagehide handlers all do.
      appStore.persistPlan()

      expect(appStore.getLastEdit().toISOString()).toBe(before.toISOString())
    })

    // A restore from the account bypasses the loader, so loadingCompleted never fires. It used to
    // be the one arrival path that clears plannerVersion (deliberately, so the question WOULD be
    // asked) and then had nothing ask it - the plan just turned red with no explanation.
    it('raises the notice for a bare array restored from the account', () => {
      appStore.loadServerPlan(unmigratedPlan())

      expect(appStore.showRawBreakingNotice).toBe(true)
    })

    // Calculated first, because that is what a tab written by a current client actually carries.
    // The bare-array branch above recalculates on arrival (its ledger means something different);
    // this branch deliberately does not, since a current client's quantities are the user's own.
    it('raises the notice for a whole tab restored from the account', () => {
      const tab = appStore.getCurrentTab()!
      const factories = unmigratedPlan()
      calculateFactories(factories, gameData)

      appStore.loadServerPlan({ ...tab, plannerVersion: undefined, factories })

      expect(appStore.showRawBreakingNotice).toBe(true)
    })

    // The reason that branch must not force a recalculation: a restore is not the moment to
    // overwrite what the user set. An item deliberately left out of step with its building groups
    // keeps its own quantity rather than being rewritten from them.
    it('does not rewrite a restored tab\'s quantities from its building groups', () => {
      const tab = appStore.getCurrentTab()!
      const factories = unmigratedPlan()
      calculateFactories(factories, gameData)
      const product = factories[0].products[0]
      product.buildingGroupItemSync = false
      product.buildingGroups[0].buildingCount = 99
      const authored = product.amount

      appStore.loadServerPlan({ ...tab, plannerVersion: undefined, factories })

      expect(appStore.getFactories()[0].products[0].amount).toBe(authored)
    })

    it('stays silent for an already answered tab restored from the account', () => {
      const tab = appStore.getCurrentTab()!
      appStore.loadServerPlan({
        ...tab, plannerVersion: config.plannerVersion, factories: unmigratedPlan(),
      })

      expect(appStore.showRawBreakingNotice).toBe(false)
    })

    // Someone starting from nothing has no plan to have been broken, so there is no news.
    it('stays silent for an empty plan', async () => {
      await appStore.beginLoading([])

      expect(appStore.showRawBreakingNotice).toBe(false)
    })

    // A plan from before the change that happens to need nothing is not worth interrupting for.
    it('stays silent when there is nothing to migrate', async () => {
      const factory = newFactory('Fine As It Is')
      const tab = appStore.getCurrentTab()
      if (tab) delete tab.plannerVersion
      appStore.setFactories([factory], true)

      await appStore.beginLoading([factory])

      expect(appStore.showRawBreakingNotice).toBe(false)
    })

    // The answer belongs to the plan. Dismissing it once must not silence the next pre-v0.6
    // plan the user pastes, opens from a share link or restores from their account.
    it('stamps the plan when dismissed, and never asks that plan again', async () => {
      await loadAsLegacyPlan(unmigratedPlan())
      expect(appStore.showRawBreakingNotice).toBe(true)

      appStore.dismissRawBreakingNotice()

      expect(appStore.showRawBreakingNotice).toBe(false)
      expect(appStore.getCurrentTab()?.plannerVersion).toBe(config.plannerVersion)

      await appStore.beginLoading(appStore.getFactories())
      expect(appStore.showRawBreakingNotice).toBe(false)
    })

    it('asks again for a different plan that has not been answered for', async () => {
      await loadAsLegacyPlan(unmigratedPlan())
      appStore.dismissRawBreakingNotice()
      expect(appStore.showRawBreakingNotice).toBe(false)

      // What a share link, a paste or a cloud restore of an older plan amounts to.
      await loadAsLegacyPlan(unmigratedPlan())

      expect(appStore.showRawBreakingNotice).toBe(true)
    })

    it('comes back after the debug scenario re-arms it', async () => {
      await loadAsLegacyPlan(unmigratedPlan())
      appStore.dismissRawBreakingNotice()
      expect(appStore.showRawBreakingNotice).toBe(false)

      appStore.rearmRawBreakingNotice()
      await appStore.beginLoading(appStore.getFactories())

      expect(appStore.showRawBreakingNotice).toBe(true)
    })

    // Saved plans still carry the field the assumption used to live on. It means nothing now,
    // so it must not ride along through every share, paste and sync from here on.
    it('strips the dead assumption field from a loaded plan', async () => {
      const factory = newFactory('Old Plan')
      ;(factory as Factory & LegacyRawAssumptionFields).assumeRawInputs = true
      const tab = appStore.getCurrentTab()
      if (tab) (tab as FactoryTab & LegacyRawAssumptionFields).assumeRawInputs = true

      await appStore.beginLoading([factory])

      expect('assumeRawInputs' in factory).toBe(false)
      expect('assumeRawInputs' in (appStore.getCurrentTab() ?? {})).toBe(false)
    })
  })

  // The reason the marker sits on the tab and the whole tab is uploaded: /save used to take a
  // bare Factory[], so everything plan-level was dropped the moment a plan came back from an
  // account — and the plan would then ask about raw resources it had already been answered for.
  describe('loadServerPlan', () => {
    beforeEach(() => {
      resetAppStore()
    })

    it('restores plan-level state from a whole-tab payload', () => {
      appStore.loadServerPlan({
        id: 'from-the-server',
        name: 'My Plan',
        factories: [newFactory('Foo')],
        powerTarget: 40000,
        plannerVersion: '0.6',
      })

      const tab = appStore.getCurrentTab()
      expect(tab?.plannerVersion).toBe('0.6')
      expect(tab?.powerTarget).toBe(40000)
      expect(appStore.getFactories()).toHaveLength(1)
    })

    // The name is part of the plan and travels with it; the id is local state this machine keys
    // its tabs by, so it stays put.
    it('restores the name the plan was saved under, keeping the local tab id', () => {
      const before = appStore.getCurrentTab()?.id

      appStore.loadServerPlan({
        id: 'from-the-server',
        name: 'My Plan',
        factories: [newFactory('Foo')],
      })

      const tab = appStore.getCurrentTab()
      expect(tab?.name).toBe('My Plan')
      expect(tab?.id).toBe(before)
    })

    it('keeps the local name when the saved plan has none', () => {
      const tab = appStore.getCurrentTab()
      if (tab) tab.name = 'Local name'

      appStore.loadServerPlan({ id: 'x', name: '', factories: [] })

      expect(appStore.getCurrentTab()?.name).toBe('Local name')
    })

    // A client that has not reloaded yet still saves the old shape, and every account saved
    // before v0.6 holds one. Read as what it is: a plan from before the change.
    it('reads a bare factory array as a plan that predates the change', () => {
      const tab = appStore.getCurrentTab()
      if (tab) tab.plannerVersion = '0.6'

      appStore.loadServerPlan([newFactory('Foo')])

      expect(appStore.getFactories()).toHaveLength(1)
      // The point of the test: the tab was answered for contents it no longer has, and a bare
      // array predates the change, so the answer has to be cleared or the notice never fires.
      expect(appStore.getCurrentTab()?.plannerVersion).toBeUndefined()
    })

    it('keeps the answer when a tab-shaped plan carries one', () => {
      appStore.loadServerPlan({
        id: 'x', name: 'Cloud', factories: [newFactory('Foo')], plannerVersion: '0.6',
      } as never)

      expect(appStore.getCurrentTab()?.plannerVersion).toBe('0.6')
    })

    // Absent means fully researched, so a restore that dropped these would hand a tier-0 plan
    // sixteen times the upload speed it was sized against and silence every over-capacity row.
    it('restores the Depot research the plan was saved with', () => {
      appStore.loadServerPlan({
        id: 'x',
        name: 'Cloud',
        factories: [newFactory('Foo')],
        depotUploadTier: 0,
        depotExpansionTier: 1,
      } as never)

      const tab = appStore.getCurrentTab()
      expect(tab?.depotUploadTier).toBe(0)
      expect(tab?.depotExpansionTier).toBe(1)
    })

    it('clears the local tiers when the saved plan predates them', () => {
      const tab = appStore.getCurrentTab()
      if (tab) {
        tab.depotUploadTier = 0
        tab.depotExpansionTier = 0
      }

      appStore.loadServerPlan({ id: 'x', name: 'Cloud', factories: [newFactory('Foo')] } as never)

      expect(appStore.getCurrentTab()?.depotUploadTier).toBeUndefined()
      expect(appStore.getCurrentTab()?.depotExpansionTier).toBeUndefined()
    })
  })

  // JSON.stringify drops an undefined key, so a plan from before the change arrives through a
  // share link or the clipboard with no plannerVersion at all — indistinguishable from a new tab
  // unless its factories are taken into account.
  describe('addTab and the raw-resources answer', () => {
    it('leaves an imported plan carrying no version unanswered', () => {
      appStore.addTab({ name: 'Shared', factories: [newFactory('Foo')] })

      expect(appStore.getCurrentTab()?.plannerVersion).toBeUndefined()
    })

    it('marks a tab conjured out of nothing as answered', () => {
      appStore.addTab({ name: 'Empty' })

      expect(appStore.getCurrentTab()?.plannerVersion).toBe(config.plannerVersion)
    })

    it('preserves a version the imported plan carries', () => {
      appStore.addTab({ name: 'Modern', factories: [newFactory('Foo')], plannerVersion: '0.6' })

      expect(appStore.getCurrentTab()?.plannerVersion).toBe('0.6')
    })

    // A share link builds its tab through here, so tiers dropped at this point arrive reading as
    // fully researched and quietly resize the sender's plan against the recipient's save.
    it('preserves the Depot research an imported plan carries', () => {
      appStore.addTab({
        name: 'Shared',
        factories: [newFactory('Foo')],
        depotUploadTier: 2,
        depotExpansionTier: 3,
      })

      const tab = appStore.getCurrentTab()
      expect(tab?.depotUploadTier).toBe(2)
      expect(tab?.depotExpansionTier).toBe(3)
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

      // No factory carries a memberless group, so nothing else would take it with the plan.
      it('should take the memberless groups with it', () => {
        appStore.addFactory(newFactory('Foobarbaz'))
        appStore.getCurrentTab().groups = [{ id: 'g1', name: 'Empty', color: '#4caf50', order: 0 }]

        appStore.clearFactories()

        expect(appStore.getCurrentTab().groups).toBeUndefined()
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

      // Share links and templates arrive through here, and a memberless group is the only kind
      // no factory carries in for us.
      it('should preserve memberless groups when importing a tab', () => {
        appStore.addTab({
          id: '13579',
          name: 'Shared Tab',
          factories: [],
          groups: [{ id: 'g1', name: 'Empty', color: '#4caf50', order: 0 }],
        })

        expect(appStore.getCurrentTab().groups).toEqual([
          { id: 'g1', name: 'Empty', color: '#4caf50', order: 0 },
        ])
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
})
