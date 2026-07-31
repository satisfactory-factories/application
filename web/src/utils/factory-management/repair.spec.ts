import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { repairPlanPrecision } from '@/utils/factory-management/repair'
import { create485DemoPlan, create485Scenario } from '@/utils/factory-setups/485-drifted-plan'
import { gameData } from '@/utils/gameData'

describe('repair', () => {
  describe('repairPlanPrecision', () => {
    describe('the plan attached to #485', () => {
      let factories: Factory[]

      beforeEach(() => {
        factories = create485Scenario()
      })

      it('should repair every drifted Rocket Fuel figure it seeds the calculation with', () => {
        const report = repairPlanPrecision(factories, gameData)
        const producer = factories[0].powerProducers[0]

        expect(producer.fuelAmount).toBe(2400)
        expect(producer.ingredients[0].perMin).toBe(2400)
        // fuelAmount and the fuel ingredient's perMin are the same number held twice
        expect(report.repairs).toHaveLength(1)
      })

      it('should describe each repair in terms the user recognises', () => {
        const report = repairPlanPrecision(factories, gameData)

        expect(report.repairs[0]).toEqual({
          kind: 'quantity',
          factoryName: 'FG TEST',
          itemName: 'Rocket Fuel',
          context: 'Fuel-Powered Generator (Rocket Fuel)',
          field: 'Fuel rate',
          before: 2400.002,
          after: 2400,
        })
      })

      it('should not report the same repaired quantity twice', () => {
        const report = repairPlanPrecision(factories, gameData)

        expect(report.repairs.map(entry => entry.field)).toEqual(['Fuel rate'])
      })

      it('should refresh the stale mwPerItem the save was made with', () => {
        const report = repairPlanPrecision(factories, gameData)

        expect(factories[0].powerProducers[0].ingredients[0].mwPerItem).toBe(60)
        expect(report.staleRecipeFigures).toBe(1)
      })

      it('should leave the plan wholly clean once recalculated', () => {
        repairPlanPrecision(factories, gameData)
        calculateFactories(factories, gameData, { origin: 'recalculate' })

        const factory = factories[0]
        const producer = factory.powerProducers[0]

        expect(producer.fuelAmount).toBe(2400)
        expect(producer.ingredients[0].perMin).toBe(2400)
        expect(producer.powerProduced).toBe(144000)
        expect(producer.buildingGroups[0].parts.RocketFuel).toBe(2400)
        expect(factory.parts.RocketFuel.amountRequired).toBe(2400)
        expect(factory.parts.RocketFuel.amountRequiredPower).toBe(2400)
        expect(factory.parts.RocketFuel.amountRemaining).toBe(-2400)
      })

      it('should preserve the user\'s 240% clock while repairing', () => {
        repairPlanPrecision(factories, gameData)
        calculateFactories(factories, gameData, { origin: 'recalculate' })

        const group = factories[0].powerProducers[0].buildingGroups[0]
        expect(group.buildingCount).toBe(240)
        expect(group.overclockPercent).toBe(240)
      })

      it('should report nothing on a second pass', () => {
        repairPlanPrecision(factories, gameData)
        const second = repairPlanPrecision(factories, gameData)

        expect(second.repairs).toEqual([])
        expect(second.staleRecipeFigures).toBe(0)
      })
    })

    // The template behind the Templates dialog's "#485: Micro-rounding repair" button.
    describe('the demo plan', () => {
      it('should repair every factory and leave the plan on whole numbers', () => {
        const factories = create485DemoPlan().getFactories()

        const report = repairPlanPrecision(factories, gameData)
        calculateFactories(factories, gameData, { origin: 'recalculate' })

        const [refinery, fgTest, megaPlant] = factories
        expect(refinery.products[0].amount).toBe(14400)
        expect(fgTest.powerProducers[0].fuelAmount).toBe(2400)
        expect(fgTest.powerProducers[1].fuelAmount).toBe(3000)
        expect(fgTest.inputs[0].amount).toBe(2400)
        expect(megaPlant.powerProducers[0].fuelAmount).toBe(12000)
        expect(megaPlant.inputs[0].amount).toBe(12000)

        // One heading per factory in the dialog, in plan order. The copied refinery drifts
        // exactly as its original does, so it is reported alongside it.
        expect([...new Set(report.repairs.map(entry => entry.factoryName))]).toEqual([
          'Rocket Fuel Refinery', 'FG TEST', 'Mega Rocket Fuel Plant', 'Rocket Fuel Refinery (copy)',
        ])
      })

      it('should include drift past the flat snap tolerance', () => {
        const factories = create485DemoPlan().getFactories()

        const report = repairPlanPrecision(factories, gameData)

        // 0.012 and 0.01 — both beyond the runtime's flat 0.002 allowance. The copied
        // refinery contributes a second 14400.012.
        const large = report.repairs.filter(entry => Math.abs(entry.before - entry.after) > 0.002)
        expect(large.map(entry => entry.before).sort((a, b) => a - b)).toEqual([
          12000.01, 12000.01, 14400.012, 14400.012,
        ])
      })
    })

    describe('tolerance', () => {
      let factory: Factory

      beforeEach(() => {
        factory = newFactory('Drifted')
        addProductToFactory(factory, { id: 'IronPlate', amount: 100, recipe: 'IronPlate' })
      })

      it('should repair drift too large for the flat runtime tolerance', () => {
        // 1,200 generators @ 240% drifted by 0.01 — five times the 0.002 the runtime snap
        // allows, so only a tolerance that scales with the value catches it.
        factory.products[0].amount = 12000.01

        repairPlanPrecision([factory], gameData)

        expect(factory.products[0].amount).toBe(12000)
      })

      it('should repair drift at the small end too', () => {
        factory.products[0].amount = 1000.001

        repairPlanPrecision([factory], gameData)

        expect(factory.products[0].amount).toBe(1000)
      })

      it('should not touch a deliberately fractional quantity', () => {
        factory.products[0].amount = 12000.5

        repairPlanPrecision([factory], gameData)

        expect(factory.products[0].amount).toBe(12000.5)
      })

      it('should not touch a quantity a whole part per million away', () => {
        // 0.05 at 12,000 is 4 parts per million — far too coarse to be this bug.
        factory.products[0].amount = 12000.05

        repairPlanPrecision([factory], gameData)

        expect(factory.products[0].amount).toBe(12000.05)
      })

      it('should never snap a small quantity down to zero', () => {
        factory.products[0].amount = 0.001

        repairPlanPrecision([factory], gameData)

        expect(factory.products[0].amount).toBe(0.001)
      })
    })

    describe('deliberate precision', () => {
      it('should leave a product on a user-set fractional clock alone', () => {
        const factory = newFactory('Precise')
        addProductToFactory(factory, { id: 'IronPlate', amount: 535.999, recipe: 'IronPlate' })
        calculateFactories([factory], gameData)

        const group = factory.products[0].buildingGroups[0]
        group.overclockPercent = 223.333
        group.clockSetByUser = true
        factory.products[0].amount = 535.999

        repairPlanPrecision([factory], gameData)

        expect(factory.products[0].amount).toBe(535.999)
      })

      it('should still repair a product whose fractional clock the solver derived', () => {
        const factory = newFactory('Solver derived')
        addProductToFactory(factory, { id: 'IronPlate', amount: 535.999, recipe: 'IronPlate' })
        calculateFactories([factory], gameData)

        const group = factory.products[0].buildingGroups[0]
        group.overclockPercent = 223.333
        group.clockSetByUser = false
        factory.products[0].amount = 535.999

        repairPlanPrecision([factory], gameData)

        expect(factory.products[0].amount).toBe(536)
      })

      it('should leave a power producer on a user-set fractional clock alone', () => {
        const factory = newFactory('Precise power')
        addPowerProducerToFactory(factory, {
          building: 'generatorfuel',
          buildingAmount: 10,
          recipe: 'GeneratorFuel_RocketFuel',
          updated: FactoryPowerChangeType.Building,
        })
        calculateFactories([factory], gameData)

        const producer = factory.powerProducers[0]
        producer.buildingGroups[0].overclockPercent = 223.333
        producer.buildingGroups[0].clockSetByUser = true
        producer.fuelAmount = 2400.002

        repairPlanPrecision([factory], gameData)

        expect(producer.fuelAmount).toBe(2400.002)
      })
    })

    describe('inputs', () => {
      let producing: Factory
      let consuming: Factory

      beforeEach(() => {
        producing = newFactory('Rocket fuel producer')
        addProductToFactory(producing, { id: 'RocketFuel', amount: 2400, recipe: 'RocketFuel' })

        consuming = newFactory('Fuel generators')
        consuming.inputs.push({ factoryId: producing.id, outputPart: 'RocketFuel', amount: 2400.002 })

        calculateFactories([producing, consuming], gameData)
      })

      it('should repair a drifted import amount', () => {
        consuming.inputs[0].amount = 2400.002

        repairPlanPrecision([producing, consuming], gameData)

        expect(consuming.inputs[0].amount).toBe(2400)
      })

      it('should leave an import alone when its source factory has deliberate precision', () => {
        // The import mirrors a quantity the producing factory decided on, so it inherits
        // that factory's precision rather than being judged on its own.
        const group = producing.products[0].buildingGroups[0]
        group.overclockPercent = 223.333
        group.clockSetByUser = true
        consuming.inputs[0].amount = 2400.002

        repairPlanPrecision([producing, consuming], gameData)

        expect(consuming.inputs[0].amount).toBe(2400.002)
      })
    })
  })
})
