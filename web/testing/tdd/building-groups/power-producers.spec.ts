import { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import PowerProducer from '../../../src/components/planner/products/PowerProducer.vue'
import { calculateFactories, newFactory } from '../../../src/utils/factory-management/factory'
import { addPowerProducerToFactory } from '../../../src/utils/factory-management/power'
import { Factory, FactoryPowerChangeType, FactoryPowerProducer } from '../../../src/interfaces/planner/FactoryInterface'
import { fetchGameData } from '../../../src/utils/gameDataService'
import { mountItem } from '../../helpers'

// @ts-ignore // this is fine, it works, stop moaning
const gameData = await fetchGameData()

const mountPowerProducer = (factory: Factory) => {
  return mountItem(factory, PowerProducer)
}

// Sets up a factory containing a single liquid-fuel generator producer, with the
// building groups tray open (otherwise the groups + add button do not render).
const setupFuelProducer = (factory: Factory): FactoryPowerProducer => {
  addPowerProducerToFactory(factory, {
    building: 'generatorfuel',
    buildingAmount: 1,
    recipe: 'GeneratorFuel_LiquidFuel',
    updated: FactoryPowerChangeType.Building,
  })
  const producer = factory.powerProducers[0]
  producer.buildingGroupsTrayOpen = true
  calculateFactories([factory], gameData)
  return producer
}

// Sets up a factory containing a single nuclear producer (has a supplemental
// fuel ingredient — Water — at ingredients[1]).
const setupNuclearProducer = (factory: Factory): FactoryPowerProducer => {
  addPowerProducerToFactory(factory, {
    building: 'generatornuclear',
    buildingAmount: 1,
    recipe: 'GeneratorNuclear_NuclearFuelRod',
    updated: FactoryPowerChangeType.Building,
  })
  const producer = factory.powerProducers[0]
  producer.buildingGroupsTrayOpen = true
  calculateFactories([factory], gameData)
  return producer
}

describe('TDD: BG-I-E-POW: Power Producer Building Groups', () => {
  let factory: Factory
  let producer: FactoryPowerProducer
  let subject: VueWrapper

  describe('BG-E-B-POW: Building Groups Editing - Buildings (Power Producers)', () => {
    beforeEach(async () => {
      factory = newFactory('BG-E-B-POW Factory')
      producer = setupFuelProducer(factory)
      subject = mountPowerProducer(factory)
      await nextTick()
    })

    test('BG-E-B-POW-1: Allows editing the building count', async () => {
      const group = producer.buildingGroups[0]
      const groupCount = subject.find(`[id="${factory.id}-${group.id}-building-count"]`)

      // Assert the before
      expect(groupCount.exists()).toBe(true)
      expect(producer.buildingGroups[0].buildingCount).toBe(1)

      // Edit the group's building count directly
      await groupCount.setValue(5)
      await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc

      // The group should reflect the new count
      expect(producer.buildingGroups[0].buildingCount).toBe(5)
      // And with sync ON, the edit should write back to the producer's building count
      expect(producer.buildingGroupItemSync).toBe(true)
      expect(producer.buildingCount).toBe(5)
    })
  })

  describe('BG-I-E-POW: Item Editing (Power Producers)', () => {
    describe('Editing', () => {
      beforeEach(async () => {
        factory = newFactory('BG-I-E-POW Factory')
        producer = setupFuelProducer(factory)
        subject = mountPowerProducer(factory)
        await nextTick()
      })

      test('BG-I-E-POW-1: Editing the generator recreates the building group @ 1 building', async () => {
        // Bump the producer up to 4 buildings so we can prove it resets
        const fuel = subject.find(`[id="${factory.id}-${producer.id}-fuel-quantity"]`)
        await fuel.setValue('80')
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc
        expect(producer.buildingGroups[0].buildingCount).toBe(4)

        // Switch the generator via the building autocomplete (first VAutocomplete)
        const autocompletes = subject.findAllComponents({ name: 'VAutocomplete' })
        producer.building = 'generatorcoal'
        autocompletes[0].vm.$emit('update:modelValue', 'generatorcoal')
        await nextTick()

        expect(producer.building).toBe('generatorcoal')
        expect(producer.recipe).toBe('GeneratorCoal_Coal')
        // Building groups should have been reset to a single group @ 1 building
        expect(producer.buildingGroups.length).toBe(1)
        expect(producer.buildingGroups[0].buildingCount).toBe(1)
      })

      test('BG-I-E-POW-2: Editing the fuel recipe recreates the building group @ 1 building', async () => {
        // Bump the producer up to 4 buildings so we can prove it resets
        const fuel = subject.find(`[id="${factory.id}-${producer.id}-fuel-quantity"]`)
        await fuel.setValue('80')
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc
        expect(producer.buildingGroups[0].buildingCount).toBe(4)

        // Switch the fuel recipe via the recipe autocomplete (second VAutocomplete)
        const autocompletes = subject.findAllComponents({ name: 'VAutocomplete' })
        producer.recipe = 'GeneratorFuel_LiquidBiofuel'
        autocompletes[1].vm.$emit('update:modelValue', 'GeneratorFuel_LiquidBiofuel')
        await nextTick()

        expect(producer.recipe).toBe('GeneratorFuel_LiquidBiofuel')
        // Building groups should have been reset to a single group @ 1 building
        expect(producer.buildingGroups.length).toBe(1)
        expect(producer.buildingGroups[0].buildingCount).toBe(1)
      })
    })

    describe('Sync on - fuel & buildings (single group)', () => {
      beforeEach(async () => {
        factory = newFactory('BG-I-E-POW Factory')
        producer = setupFuelProducer(factory)
        subject = mountPowerProducer(factory)
        producer.buildingGroupItemSync = true
        await nextTick()
      })

      test('BG-I-E-POW-7: Increasing fuel quantity increases group buildings AND rebalances', async () => {
        // Assert the before (1 building)
        expect(producer.buildingGroups[0].buildingCount).toBe(1)

        // Liquid fuel generator consumes 20/min per building, so 80 => 4 buildings
        const fuel = subject.find(`[id="${factory.id}-${producer.id}-fuel-quantity"]`)
        await fuel.setValue('80')
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc

        expect(producer.buildingCount).toBe(4)
        expect(producer.buildingGroups[0].buildingCount).toBe(4)
      })

      test('BG-I-E-POW-8: Decreasing fuel quantity decreases group buildings AND rebalances', async () => {
        // Set up at 4 buildings first
        const fuel = subject.find(`[id="${factory.id}-${producer.id}-fuel-quantity"]`)
        await fuel.setValue('80')
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc
        expect(producer.buildingGroups[0].buildingCount).toBe(4)

        // Now decrease to 40 => 2 buildings
        await fuel.setValue('40')
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc

        expect(producer.buildingCount).toBe(2)
        expect(producer.buildingGroups[0].buildingCount).toBe(2)
      })

      test('BG-I-E-POW-9: Changing buildings changes group buildings (single group)', async () => {
        // Assert the before (1 building)
        expect(producer.buildingGroups[0].buildingCount).toBe(1)

        const buildingCount = subject.find(`[id="${factory.id}-${producer.id}-building-count"]`)
        await buildingCount.setValue(6)
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc

        expect(producer.buildingCount).toBe(6)
        expect(producer.buildingGroups[0].buildingCount).toBe(6)
      })
    })

    describe('Sync on - buildings (multiple groups)', () => {
      beforeEach(async () => {
        factory = newFactory('BG-I-E-POW Factory')
        producer = setupFuelProducer(factory)
        subject = mountPowerProducer(factory)
        producer.buildingGroupItemSync = true
        await nextTick()

        // Get to 4 buildings, then add a second group
        const fuel = subject.find(`[id="${factory.id}-${producer.id}-fuel-quantity"]`)
        await fuel.setValue('80')
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc

        const addBuildingGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
        await addBuildingGroupButton.trigger('click')
        expect(producer.buildingGroups.length).toBe(2)

        // Adding a 2nd group auto-disables sync — re-enable it for the rebalance test
        producer.buildingGroupItemSync = true
        await nextTick()
      })

      test('BG-I-E-POW-10: Changing buildings changes AND rebalances group buildings (multiple groups)', async () => {
        // Change the producer's building count to 8, which with sync ON should
        // rebalance evenly across the two groups (4 + 4)
        const buildingCount = subject.find(`[id="${factory.id}-${producer.id}-building-count"]`)
        await buildingCount.setValue(8)
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc

        expect(producer.buildingCount).toBe(8)
        expect(producer.buildingGroups[0].buildingCount).toBe(4)
        expect(producer.buildingGroups[1].buildingCount).toBe(4)
      })
    })

    describe('Sync on - supplemental fuel (single group)', () => {
      beforeEach(async () => {
        factory = newFactory('BG-I-E-POW Factory')
        producer = setupNuclearProducer(factory)
        subject = mountPowerProducer(factory)
        producer.buildingGroupItemSync = true
        await nextTick()
      })

      test('BG-I-E-POW-13: Changing supplemental fuel changes group buildings (single group)', async () => {
        // Nuclear plant uses 240 Water/min per building. 960 => 4 buildings.
        expect(producer.buildingGroups[0].buildingCount).toBe(1)

        const water = subject.find(`[id="${factory.id}-${producer.id}-Water"]`)
        expect(water.exists()).toBe(true)
        await water.setValue(240 * 4)
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc

        expect(producer.buildingCount).toBe(4)
        expect(producer.buildingGroups[0].buildingCount).toBe(4)
      })
    })

    describe('Sync on - supplemental fuel (multiple groups)', () => {
      beforeEach(async () => {
        factory = newFactory('BG-I-E-POW Factory')
        producer = setupNuclearProducer(factory)
        subject = mountPowerProducer(factory)
        producer.buildingGroupItemSync = true
        await nextTick()

        // Add a second group
        const addBuildingGroupButton = subject.find(`[id="${factory.id}-add-building-group"]`)
        await addBuildingGroupButton.trigger('click')
        expect(producer.buildingGroups.length).toBe(2)

        // Adding a 2nd group auto-disables sync — re-enable it for the rebalance test
        producer.buildingGroupItemSync = true
        await nextTick()
      })

      test('BG-I-E-POW-14: Changing supplemental fuel changes AND rebalances (multiple groups)', async () => {
        // 960 Water => 4 buildings, rebalanced evenly across two groups (2 + 2)
        const water = subject.find(`[id="${factory.id}-${producer.id}-Water"]`)
        await water.setValue(240 * 4)
        await new Promise(resolve => setTimeout(resolve, 500)) // Debounced recalc

        expect(producer.buildingCount).toBe(4)
        expect(producer.buildingGroups[0].buildingCount).toBe(2)
        expect(producer.buildingGroups[1].buildingCount).toBe(2)
      })
    })
  })
})
