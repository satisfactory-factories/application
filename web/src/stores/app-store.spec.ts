import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactory, newFactory } from '@/utils/factory-management/factory'
import * as FactoryManager from '@/utils/factory-management/factory'
import { useAppStore } from '@/stores/app-store'
import { addProductToFactory } from '@/utils/factory-management/products'
import { gameData } from '@/utils/gameData'
import { createPinia, setActivePinia } from 'pinia'
import eventBus from '@/utils/eventBus'

let appStore: ReturnType<typeof useAppStore>

const resetAppStore = (keepLocalStorage = false) => {
  if (!keepLocalStorage) {
    localStorage.removeItem('factoryTabs')
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
    it('should NOT call calculateFactories when not required', () => {
      // @ts-ignore
      factory.tasks = undefined

      // Spy on the calculateFactories function
      const spy = vi.spyOn(FactoryManager, 'calculateFactories')

      appStore.initFactories(factories)

      expect(spy).not.toHaveBeenCalled()
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

      it('should emit the plannerHideContent event', async () => {
        await appStore.prepareLoader()
        expect(eventBus.emit).toHaveBeenCalledWith('plannerHideContent')
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
        afterEach(() => {
          localStorage.removeItem('preLoadFactories')
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

        // Tried doing this but the spy won't work.
        // it('should call loadNextFactory', async () => {
        //   const spy = vi.spyOn(appStore, 'loadNextFactory')
        //
        //   await appStore.beginLoading(factories)
        //
        //   expect(spy).toHaveBeenCalled()
        // })
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
          await appStore.prepareLoader(factories)

          await appStore.beginLoading(factories)

          expect(eventBus.emit).toHaveBeenCalledTimes(7) // 5 other times, annoyingly we can't check the payload
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

        // Start spying
        vi.spyOn(eventBus, 'emit')

        // Call it again, at this point it should be inited
        appStore.getFactories()

        // Meaning this should not have fired
        expect(eventBus.emit).not.toHaveBeenCalledWith('prepareForLoad', expect.any(Object))
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
  })
})
