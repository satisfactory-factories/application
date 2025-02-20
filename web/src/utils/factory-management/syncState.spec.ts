import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { calculateSyncState, setSyncState } from '@/utils/factory-management/syncState'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'

describe('syncState', () => {
  let mockFactory: Factory

  beforeEach(() => {
    mockFactory = newFactory('Iron Ingots')
    addProductToFactory(mockFactory, {
      id: 'IronIngot',
      amount: 100,
      recipe: 'IngotIron',
    })
    addPowerProducerToFactory(mockFactory, {
      building: 'generatorfuel',
      buildingAmount: 1,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Power,
    })
    setSyncState(mockFactory)
  })

  describe('setSyncState', () => {
    it('factory should be null sync on start', () => {
      mockFactory = newFactory('Iron Ingots')
      expect(mockFactory.inSync).toBe(null)
    })

    describe('setSyncState checks', () => {
      beforeEach(() => {
        setSyncState(mockFactory)
      })

      it('should properly record the sync state for products', () => {
        expect(mockFactory.syncState.IronIngot).toEqual({
          amount: 100,
          recipe: 'IngotIron',
        })
      })

      it('should properly record the sync state for power producers', () => {
        expect(mockFactory.syncState.IronIngot.amount).toBe(100)
      })

      it('should properly remove sync state when there are no products', () => {
        // Remove the power producers
        mockFactory.products = []

        // Run it again
        setSyncState(mockFactory)

        // Check that the sync state is empty
        expect(mockFactory.syncState).toEqual({})
      })

      it('should properly remove sync state when there are no power producers', () => {
        // Remove the power producers
        mockFactory.powerProducers = []

        // Run it again
        setSyncState(mockFactory)

        // Check that the sync state is empty
        expect(mockFactory.syncStatePower).toEqual({})
      })
    })
  })

  describe('calculateSyncState', () => {
    describe('product sync', () => {
      it('should be true if there is no changes', () => {
        expect(mockFactory.inSync).toBe(true)

        calculateSyncState(mockFactory)

        // Nothing should have changed
        expect(mockFactory.inSync).toBe(true)
      })

      it('should detect a change in products', () => {
        mockFactory.syncState.IronIngot.amount = 50

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should not affect a factory with no sync state', () => {
        mockFactory.inSync = null
        mockFactory.syncState = {}

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(null)
      })

      it('should detect a desynced factory across multiple products', () => {
        addProductToFactory(mockFactory, {
          id: 'CopperIngot',
          amount: 100,
          recipe: 'CopperIngot',
        })
        mockFactory.syncState.IronIngot = { amount: 100, recipe: 'IronIngot' }
        mockFactory.syncState.CopperIngot = { amount: 50, recipe: 'CopperIngot' }

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should maintain a synced factory across multiple products', () => {
        addProductToFactory(mockFactory, {
          id: 'CopperIngot',
          amount: 100,
          recipe: 'CopperIngot',
        })
        mockFactory.inSync = true
        mockFactory.syncState.IronIngot.amount = 100
        mockFactory.syncState.CopperIngot = { amount: 100, recipe: 'CopperIngot' }

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(true)
      })

      it('should drop factory out of sync when there are no products', () => {
        mockFactory.products = []
        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should mark a factory as out of sync when new products are added', () => {
        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(true)

        addProductToFactory(mockFactory, {
          id: 'CopperIngot',
          amount: 100,
          recipe: 'CopperIngot',
        })
        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should mark a factory as out of sync when the recipe of a product is changed', () => {
        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(true)

        mockFactory.products[0].recipe = 'Alternate_IronIngot_Basic'
        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })
    })

    describe('power producers sync', () => {
      it('should remain in sync when nothing has changed', () => {
      // Adjust the power building
        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(true)
      })

      it('should OOS when number of generators gets adjusted', () => {
      // Adjust the power building
        mockFactory.powerProducers[0].buildingAmount = 2

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should OOS when power amount is adjusted', () => {
      // Adjust the power building
        mockFactory.powerProducers[0].powerAmount = 1234

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should OSS when fuel amount is adjusted', () => {
      // Adjust the power building
        mockFactory.powerProducers[0].fuelAmount = 1234

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should OOS when recipe is adjusted', () => {
        // Check the before state
        expect(mockFactory.syncStatePower.generatorfuel.recipe).toBe('GeneratorFuel_LiquidFuel')

        // Adjust the power building
        mockFactory.powerProducers[0].recipe = 'GeneratorFuel_IonizedFuel'

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should OOS when the building is changed in place', () => {
        // Check the before state
        expect(mockFactory.syncStatePower.generatorfuel.buildingAmount).toBe(1)

        // Change the building
        mockFactory.powerProducers[0].building = 'generatornuclear'

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should OSS when all power producers are added', () => {
        // Remove the power producer
        addPowerProducerToFactory(mockFactory, {
          building: 'generatorfuel',
          buildingAmount: 1,
          recipe: 'GeneratorFuel_LiquidFuel',
          updated: FactoryPowerChangeType.Power,
        })

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should OSS when all power producers are removed', () => {
        // Remove the power producers
        mockFactory.powerProducers = []

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(false)
      })

      it('should do nothing if there are no power producers', () => {
        mockFactory.powerProducers = []

        // Run set it
        setSyncState(mockFactory)

        // Double check there is nothing in syncStatePower now
        expect(mockFactory.syncStatePower).toEqual({})

        calculateSyncState(mockFactory)
        expect(mockFactory.inSync).toBe(true)
      })
    })
  })
})
