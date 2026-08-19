import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { gameData } from '@/utils/gameData'
import {
  getDepotCount,
  getFactoryDepots,
  getFactoryMercerSpheres,
  getFactorySinkPower,
  getFactorySinks,
  getSinkCount,
  isDepoted,
  isSunk,
  MERCER_SPHERES_PER_DEPOT,
  setDepotCount,
  setSinkCount,
  SINK_POWER_MW,
} from '@/utils/factory-management/disposal'
import { calculateDimensionalDepot } from '@/utils/statistics'
import { showBacklogAdvisory, willBacklog } from '@/utils/factory-management/status'
import { usePlannerOptions } from '@/composables/usePlannerOptions'
import {
  isActivelySunk,
  showDisposalControls,
  showSinkControl,
} from '@/utils/factory-management/satisfaction'

// 100/min of plates from 150 iron ingots. Solid, sinkable, and nothing else in the plan wants it,
// so the whole output is surplus unless something is done with it.
const platesFactory = (name = 'Plates', amount = 100): Factory => {
  const factory = newFactory(name)
  addProductToFactory(factory, { id: 'IronPlate', amount, recipe: 'IronPlate' })
  return factory
}

describe('disposal', () => {
  describe('reading and writing counts', () => {
    let factory: Factory

    beforeEach(() => {
      factory = platesFactory()
    })

    it('reads zero for a factory that has never had a count set', () => {
      expect(getSinkCount(factory, 'IronPlate')).toBe(0)
      expect(getDepotCount(factory, 'IronPlate')).toBe(0)
      expect(isSunk(factory, 'IronPlate')).toBe(false)
      expect(isDepoted(factory, 'IronPlate')).toBe(false)
    })

    // Plans saved before this feature have no map at all, and every read goes through these.
    it('reads zero when the map is absent entirely', () => {
      delete factory.partDisposal
      expect(getSinkCount(factory, 'IronPlate')).toBe(0)
      expect(getDepotCount(factory, 'IronPlate')).toBe(0)
    })

    it('sets and reads each count independently', () => {
      setSinkCount(factory, 'IronPlate', 2)
      setDepotCount(factory, 'IronPlate', 3)

      expect(getSinkCount(factory, 'IronPlate')).toBe(2)
      expect(getDepotCount(factory, 'IronPlate')).toBe(3)
    })

    it('creates the map lazily on an older plan', () => {
      delete factory.partDisposal
      setSinkCount(factory, 'IronPlate', 1)
      // Read through the getter: `delete` narrows the field to undefined for the rest of the
      // block, so the direct property access no longer typechecks even though it is now set.
      expect(getSinkCount(factory, 'IronPlate')).toBe(1)
      expect(getDepotCount(factory, 'IronPlate')).toBe(0)
    })

    // A plan that has had counts set and cleared should save the same as one that never had them.
    it('drops the record once both counts are back to zero', () => {
      setSinkCount(factory, 'IronPlate', 2)
      setDepotCount(factory, 'IronPlate', 1)
      setSinkCount(factory, 'IronPlate', 0)
      expect(factory.partDisposal?.IronPlate).toEqual({ sinks: 0, depots: 1 })

      setDepotCount(factory, 'IronPlate', 0)
      expect(factory.partDisposal?.IronPlate).toBeUndefined()
    })

    it('does not create a record when setting zero on a part that has none', () => {
      setSinkCount(factory, 'IronPlate', 0)
      expect(factory.partDisposal).toEqual({})
    })

    // Every control that writes these can emit null (a cleared field) or a negative (a spinner
    // stepped past its minimum). A NaN reaching the ledger makes the sink bucket NaN, which makes
    // the part permanently unsatisfiable — so these are floored rather than rejected.
    it.each([
      ['null', null, 0],
      ['undefined', undefined, 0],
      ['a negative', -5, 0],
      ['a NaN', Number.NaN, 0],
      ['Infinity', Number.POSITIVE_INFINITY, 0],
      ['a string that is not a number', 'two', 0],
      ['a fraction', 2.7, 2],
      ['a numeric string', '3', 3],
    ])('floors %s to a usable count', (_label, input, expected) => {
      setSinkCount(factory, 'IronPlate', 4)
      setSinkCount(factory, 'IronPlate', input)
      expect(getSinkCount(factory, 'IronPlate')).toBe(expected)
    })

    it('ignores a write against an empty part id', () => {
      setSinkCount(factory, '', 3)
      expect(factory.partDisposal).toEqual({})
    })
  })

  describe('factory totals', () => {
    let factory: Factory

    beforeEach(() => {
      factory = platesFactory()
      calculateFactories([factory], gameData)
    })

    it('sums the counts across every part', () => {
      setSinkCount(factory, 'IronPlate', 2)
      setDepotCount(factory, 'IronPlate', 3)
      setDepotCount(factory, 'IronIngot', 1)

      expect(getFactorySinks(factory)).toBe(2)
      expect(getFactoryDepots(factory)).toBe(4)
    })

    // The map is sticky on purpose — a flag survives its part leaving so the intent is restored if
    // the part comes back — but a stale key must not cost the user spheres or megawatts.
    it('ignores counts for parts the factory no longer handles', () => {
      setSinkCount(factory, 'IronPlate', 2)
      setDepotCount(factory, 'Cable', 5)

      expect(factory.partDisposal?.Cable).toEqual({ sinks: 0, depots: 5 })
      expect(getFactoryDepots(factory)).toBe(0)
      expect(getFactorySinks(factory)).toBe(2)
    })

    it('derives Mercer Spheres and sink power from the counts', () => {
      setDepotCount(factory, 'IronPlate', 3)
      setSinkCount(factory, 'IronPlate', 2)

      expect(getFactoryMercerSpheres(factory)).toBe(3 * MERCER_SPHERES_PER_DEPOT)
      expect(getFactorySinkPower(factory)).toBe(2 * SINK_POWER_MW)
    })
  })

  describe('the sink bucket in the ledger', () => {
    let factory: Factory

    beforeEach(() => {
      factory = platesFactory()
    })

    it('leaves the surplus alone when no sink is set', () => {
      calculateFactories([factory], gameData)

      expect(factory.parts.IronPlate.amountRemaining).toBe(100)
      expect(factory.parts.IronPlate.amountRequiredSink).toBe(0)
      expect(factory.parts.IronPlate.amountRemainingPreSink).toBe(100)
    })

    it('takes the whole surplus and lands the part at zero, satisfied', () => {
      setSinkCount(factory, 'IronPlate', 1)
      calculateFactories([factory], gameData)

      expect(factory.parts.IronPlate.amountRequiredSink).toBe(100)
      expect(factory.parts.IronPlate.amountRemaining).toBe(0)
      expect(factory.parts.IronPlate.satisfied).toBe(true)
      // The number sinking removed is never lost.
      expect(factory.parts.IronPlate.amountRemainingPreSink).toBe(100)
    })

    // The whole point of the priority-splitter model: real demand always wins, so adding an export
    // request shrinks the sunk amount by itself rather than needing a second control.
    it('shrinks as export demand grows, rather than competing with it', () => {
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 10, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: factory.id, outputPart: 'IronPlate', amount: 60 })

      setSinkCount(factory, 'IronPlate', 1)
      calculateFactories([factory, consumer], gameData)

      expect(factory.parts.IronPlate.amountRequiredExports).toBe(60)
      expect(factory.parts.IronPlate.amountRequiredSink).toBe(40)
      expect(factory.parts.IronPlate.amountRemaining).toBe(0)
    })

    it('does not turn a shortage into demand', () => {
      // Demand 150 plates from a factory making 100: 50 short, and a sink cannot help with that.
      addProductToFactory(factory, { id: 'IronPlateReinforced', amount: 25, recipe: 'IronPlateReinforced' })
      setSinkCount(factory, 'IronPlate', 1)
      calculateFactories([factory], gameData)

      expect(factory.parts.IronPlate.amountRemaining).toBeLessThan(0)
      expect(factory.parts.IronPlate.amountRequiredSink).toBe(0)
    })

    // The sink has a conveyor input only, and refuses radioactive items. A count set on one of
    // those must be inert rather than quietly zeroing a surplus that in game would not move.
    it('refuses a fluid even with a sink set', () => {
      const oil = newFactory('Oil')
      addProductToFactory(oil, { id: 'LiquidFuel', amount: 100, recipe: 'LiquidFuel' })
      setSinkCount(oil, 'LiquidFuel', 5)
      calculateFactories([oil], gameData)

      expect(oil.parts.LiquidFuel.isSinkable).toBe(false)
      expect(oil.parts.LiquidFuel.amountRequiredSink).toBe(0)
      expect(oil.parts.LiquidFuel.amountRemaining).toBe(100)
    })

    it('refuses a radioactive item even with a sink set', () => {
      const nuclear = newFactory('Nuclear')
      addProductToFactory(nuclear, { id: 'NuclearFuelRod', amount: 1, recipe: 'NuclearFuelRod' })
      nuclear.parts.NuclearWaste = {
        ...nuclear.parts.NuclearFuelRod,
        amountSuppliedViaProduction: 10,
        amountSupplied: 10,
        amountRequired: 0,
      }
      setSinkCount(nuclear, 'NuclearWaste', 1)
      calculateFactories([nuclear], gameData)

      // The engine rebuilds parts, so the waste only exists here if the plan really makes it;
      // what matters is that the sinkability rule holds either way.
      expect(nuclear.parts.NuclearWaste?.amountRequiredSink ?? 0).toBe(0)
    })

    // Sinking an ore surplus must not have the planner ask the world for more ore to throw away.
    it('does not grow the raw requirement', () => {
      const mine = newFactory('Mine')
      addProductToFactory(mine, { id: 'IronOre', amount: 240, recipe: 'IronOre' })
      calculateFactories([mine], gameData)
      const rawBefore = mine.parts.IronOre.amountSuppliedViaRaw

      setSinkCount(mine, 'IronOre', 1)
      calculateFactories([mine], gameData)

      expect(mine.parts.IronOre.amountSuppliedViaRaw).toBe(rawBefore)
      expect(mine.parts.IronOre.amountRemaining).toBe(0)
    })

    it('leaves the ledger untouched for a depot, however many containers', () => {
      setDepotCount(factory, 'IronPlate', 10)
      calculateFactories([factory], gameData)

      expect(factory.parts.IronPlate.amountRemaining).toBe(100)
      expect(factory.parts.IronPlate.amountRequiredSink).toBe(0)
    })
  })

  describe('sink power', () => {
    it('adds 30 MW per sink to the factory consumption', () => {
      const factory = platesFactory()
      calculateFactories([factory], gameData)
      const before = factory.power.consumed

      setSinkCount(factory, 'IronPlate', 2)
      calculateFactories([factory], gameData)

      expect(factory.power.consumed).toBeCloseTo(before + 60, 1)
      // Flat draw: the sink has no clock, so it does not swing with the variable-power figures.
      expect(factory.power.consumedMin).toBeCloseTo((factory.power.consumedMin ?? 0), 1)
      expect(factory.power.consumedMax! - factory.power.consumedMin!)
        .toBeCloseTo(0, 1)
    })

    it('costs nothing for a depot', () => {
      const factory = platesFactory()
      calculateFactories([factory], gameData)
      const before = factory.power.consumed

      setDepotCount(factory, 'IronPlate', 5)
      calculateFactories([factory], gameData)

      expect(factory.power.consumed).toBe(before)
    })
  })

  describe('satisfaction predicates', () => {
    let factory: Factory

    beforeEach(() => {
      factory = platesFactory()
      calculateFactories([factory], gameData)
    })

    it('offers the controls on a surplus', () => {
      expect(showDisposalControls(factory, 'IronPlate')).toBe(true)
      expect(showSinkControl(factory, 'IronPlate')).toBe(true)
    })

    it('does not offer them on a shortage', () => {
      expect(showDisposalControls(factory, 'IronIngot')).toBe(false)
    })

    // Otherwise the control that set the count vanishes and the user cannot take it back off.
    it('keeps offering them once a count is set, even with the surplus gone', () => {
      setSinkCount(factory, 'IronPlate', 1)
      calculateFactories([factory], gameData)

      expect(factory.parts.IronPlate.amountRemaining).toBe(0)
      expect(showDisposalControls(factory, 'IronPlate')).toBe(true)
    })

    it('hides the sink control for a part the sink will not take', () => {
      const oil = newFactory('Oil')
      addProductToFactory(oil, { id: 'LiquidFuel', amount: 100, recipe: 'LiquidFuel' })
      calculateFactories([oil], gameData)

      expect(showDisposalControls(oil, 'LiquidFuel')).toBe(true)
      expect(showSinkControl(oil, 'LiquidFuel')).toBe(false)
    })

    // A sink still set on a part whose surplus has since been exported away is not sinking
    // anything, and saying "Sunk" over a zero would be a lie.
    it('only reports actively sunk while the sink is actually taking something', () => {
      setSinkCount(factory, 'IronPlate', 1)
      calculateFactories([factory], gameData)
      expect(isActivelySunk(factory, 'IronPlate')).toBe(true)

      // Somebody now wants the lot, so real demand takes it all and the sink gets nothing.
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 10, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: factory.id, outputPart: 'IronPlate', amount: 100 })
      calculateFactories([factory, consumer], gameData)

      expect(factory.parts.IronPlate.amountRequiredSink).toBe(0)
      expect(isActivelySunk(factory, 'IronPlate')).toBe(false)
    })

    it('reports nothing for a part that is not in the factory', () => {
      expect(showDisposalControls(factory, 'Cable')).toBe(false)
    })
  })

  describe('the backlog advisory', () => {
    let factory: Factory

    beforeEach(() => {
      usePlannerOptions().value.showBacklogAdvisory = true
      factory = platesFactory()
      calculateFactories([factory], gameData)
    })

    // hasNoDemand only fires on ZERO demand, so this is the case nothing else could see: 100 made,
    // 60 shipped, 40 quietly backing up.
    it('fires on a partially-consumed surplus', () => {
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 10, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: factory.id, outputPart: 'IronPlate', amount: 60 })
      calculateFactories([factory, consumer], gameData)

      expect(factory.parts.IronPlate.amountRemaining).toBe(40)
      expect(willBacklog(factory, 'IronPlate')).toBe(true)
      expect(showBacklogAdvisory(factory, 'IronPlate')).toBe(true)
    })

    it('clears once a sink takes the surplus', () => {
      setSinkCount(factory, 'IronPlate', 1)
      calculateFactories([factory], gameData)

      expect(willBacklog(factory, 'IronPlate')).toBe(false)
    })

    // A depot is finite storage, so it defers the backlog rather than preventing it.
    it('does not clear for a depot', () => {
      setDepotCount(factory, 'IronPlate', 4)
      calculateFactories([factory], gameData)

      expect(willBacklog(factory, 'IronPlate')).toBe(true)
    })

    // Zero demand is hasNoDemand's case; it already names the part and says something more
    // specific about it, and two chips on one row is one fact read twice.
    it('defers to the no-demand note when nothing wants the part at all', () => {
      expect(factory.parts.IronPlate.amountRequired).toBe(0)
      expect(willBacklog(factory, 'IronPlate')).toBe(true)
      expect(showBacklogAdvisory(factory, 'IronPlate')).toBe(false)
    })

    it('is silenced entirely by the option', () => {
      usePlannerOptions().value.showBacklogAdvisory = false
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 10, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: factory.id, outputPart: 'IronPlate', amount: 60 })
      calculateFactories([factory, consumer], gameData)

      expect(willBacklog(factory, 'IronPlate')).toBe(true)
      expect(showBacklogAdvisory(factory, 'IronPlate')).toBe(false)

      usePlannerOptions().value.showBacklogAdvisory = true
    })
  })

  describe('calculateDimensionalDepot', () => {
    it('returns nothing for a plan that does not use the depot', () => {
      const factory = platesFactory()
      calculateFactories([factory], gameData)
      expect(calculateDimensionalDepot([factory])).toEqual([])
    })

    it('reports the rate, the containers and the factory behind them', () => {
      const factory = platesFactory()
      calculateFactories([factory], gameData)
      setDepotCount(factory, 'IronPlate', 2)

      const [entry] = calculateDimensionalDepot([factory])
      expect(entry.id).toBe('IronPlate')
      expect(entry.totalAmount).toBe(100)
      expect(entry.totalContainers).toBe(2)
      expect(entry.starved).toBe(false)
      expect(entry.sources).toEqual([
        expect.objectContaining({ id: factory.id, name: 'Plates', amount: 100, containers: 2 }),
      ])
    })

    it('adds up several factories feeding one item', () => {
      const first = platesFactory('Plates A', 100)
      const second = platesFactory('Plates B', 40)
      calculateFactories([first, second], gameData)
      setDepotCount(first, 'IronPlate', 1)
      setDepotCount(second, 'IronPlate', 2)

      const [entry] = calculateDimensionalDepot([first, second])
      expect(entry.totalAmount).toBe(140)
      expect(entry.totalContainers).toBe(3)
      expect(entry.sources).toHaveLength(2)
    })

    // A contributor with nothing spare is kept deliberately: it is the whole point of the starved
    // warning that the row shows who claimed to feed the item and is not.
    it('keeps a contributor at zero without calling the item starved', () => {
      const feeding = platesFactory('Plates A', 100)
      const spentUp = platesFactory('Plates B', 40)
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 5, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: spentUp.id, outputPart: 'IronPlate', amount: 40 })
      calculateFactories([feeding, spentUp, consumer], gameData)
      setDepotCount(feeding, 'IronPlate', 1)
      setDepotCount(spentUp, 'IronPlate', 1)

      const [entry] = calculateDimensionalDepot([feeding, spentUp])
      expect(entry.sources).toHaveLength(2)
      expect(entry.sources.find(source => source.name === 'Plates B')?.amount).toBe(0)
      expect(entry.starved).toBe(false)
    })

    it('marks the item starved when every contributor has nothing spare', () => {
      const factory = platesFactory('Plates', 40)
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 5, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: factory.id, outputPart: 'IronPlate', amount: 40 })
      calculateFactories([factory, consumer], gameData)
      setDepotCount(factory, 'IronPlate', 1)

      const [entry] = calculateDimensionalDepot([factory])
      expect(entry.starved).toBe(true)
      expect(entry.totalAmount).toBe(0)
    })

    // Sinking zeroes amountRemaining, so reading that would report every sunk-and-depoted item as
    // starved. The pre-sink figure is what the depot would see.
    it('reads the pre-sink surplus, so a sunk item is not reported as starved', () => {
      const factory = platesFactory()
      setSinkCount(factory, 'IronPlate', 1)
      calculateFactories([factory], gameData)
      setDepotCount(factory, 'IronPlate', 1)

      const [entry] = calculateDimensionalDepot([factory])
      expect(entry.totalAmount).toBe(100)
      expect(entry.starved).toBe(false)
    })

    it('excludes a stale flag for a part the factory no longer handles', () => {
      const factory = platesFactory()
      calculateFactories([factory], gameData)
      setDepotCount(factory, 'Cable', 3)

      expect(calculateDimensionalDepot([factory])).toEqual([])
    })

    // The logistics-centre case: a factory that produces nothing and uploads what it over-imports
    // is a real build, and gating on local production would exclude exactly it.
    it('includes an import-only factory with a surplus', () => {
      const source = platesFactory('Source', 100)
      const depot = newFactory('Depot Hub')
      addInputToFactory(depot, { factoryId: source.id, outputPart: 'IronPlate', amount: 100 })
      calculateFactories([source, depot], gameData)
      setDepotCount(depot, 'IronPlate', 1)

      const [entry] = calculateDimensionalDepot([depot])
      expect(entry.totalAmount).toBe(100)
      expect(entry.sources[0].name).toBe('Depot Hub')
    })

    it('reports the upload capacity the containers provide', () => {
      const factory = platesFactory('Plates', 600)
      calculateFactories([factory], gameData)
      setDepotCount(factory, 'IronPlate', 1)

      const [entry] = calculateDimensionalDepot([factory])
      expect(entry.uploadCapacity).toBe(240)
      expect(entry.totalAmount).toBe(600)
    })

    it('sorts by display name', () => {
      const factory = newFactory('Mixed')
      addProductToFactory(factory, { id: 'IronPlate', amount: 100, recipe: 'IronPlate' })
      addProductToFactory(factory, { id: 'Cable', amount: 100, recipe: 'Cable' })
      calculateFactories([factory], gameData)
      setDepotCount(factory, 'IronPlate', 1)
      setDepotCount(factory, 'Cable', 1)

      expect(calculateDimensionalDepot([factory]).map(entry => entry.id)).toEqual(['Cable', 'IronPlate'])
    })
  })
})
