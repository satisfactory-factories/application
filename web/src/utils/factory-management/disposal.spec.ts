import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { gameData } from '@/utils/gameData'
import eventBus from '@/utils/eventBus'
import {
  DEPOT_RESEARCH_MERCER_SPHERES,
  getDepotCount,
  getFactoryDepots,
  getFactoryMercerSpheres,
  getFactorySinkPower,
  getFactorySinks,
  getSinkCount,
  isDepoted,
  isSunk,
  MERCER_SPHERES_PER_DEPOT,
  notifySinkTutorial,
  setDepotCount,
  setSinkCount,
  SINK_POWER_MW,
  SINK_TUTORIAL_KEY,
} from '@/utils/factory-management/disposal'
import { calculateDimensionalDepot } from '@/utils/statistics'
import {
  factoryStatusClass,
  factoryStatusDefinitions,
  getFactoryStatuses,
  hasFactoryProblem,
  showBacklogAdvisory,
  willBacklog,
} from '@/utils/factory-management/status'
import { usePlannerOptions } from '@/composables/usePlannerOptions'
import {
  isActivelySunk,
  showDepotControl,
  showDisposalControls,
  showSinkControl,
} from '@/utils/factory-management/satisfaction'
import {
  clampTier,
  DEFAULT_DEPOT_TIER,
  DEPOT_EXPANSION_TIERS,
  DEPOT_UNLOCK_MERCER_SPHERES,
  DEPOT_UPLOAD_TIERS,
  depotRateForTier,
  depotResearchLabel,
  depotStacksForTier,
  depotTierLabel,
  MANUAL_UPLOADER_MERCER_SPHERES,
  MAX_DEPOT_TIER,
  mercerSpheresForExpansion,
  mercerSpheresForTier,
} from '@/composables/useDepotResearch'

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

    // Deliberately not gated on a surplus. A logistics factory imports a part exactly so it can
    // upload it, and balanced imports leave nothing spare, so a surplus gate hid the control from
    // the build the Depot exists for.
    it('offers them on a shortage too', () => {
      expect(factory.parts.IronIngot.amountRemaining).toBeLessThan(0)
      expect(showDisposalControls(factory, 'IronIngot')).toBe(true)
      expect(showSinkControl(factory, 'IronIngot')).toBe(true)
      expect(showDepotControl(factory, 'IronIngot', gameData)).toBe(true)
    })

    // An imported part consumed exactly: nothing spare, and the case that made the surplus gate
    // wrong. The Uploader has to be offered here.
    it('offers them on an import with nothing spare', () => {
      const source = platesFactory('Source')
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 5, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: source.id, outputPart: 'IronPlate', amount: 30 })
      calculateFactories([source, consumer], gameData)

      expect(consumer.parts.IronPlate.amountRemaining).toBe(0)
      expect(showDisposalControls(consumer, 'IronPlate')).toBe(true)
      expect(showDepotControl(consumer, 'IronPlate', gameData)).toBe(true)
    })

    // Sinking a part with nothing spare has to be inert rather than forbidden: that is what lets
    // the control be offered everywhere without lying about the ledger.
    it('takes nothing when a sink is set on a part with no surplus', () => {
      const source = platesFactory('Source')
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 5, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: source.id, outputPart: 'IronPlate', amount: 30 })
      setSinkCount(consumer, 'IronPlate', 2)
      calculateFactories([source, consumer], gameData)

      expect(consumer.parts.IronPlate.amountRequiredSink).toBe(0)
      expect(consumer.parts.IronPlate.amountRemaining).toBe(0)
      expect(isActivelySunk(consumer, 'IronPlate')).toBe(false)
    })

    it('keeps offering them once a count is set, even with the surplus gone', () => {
      setSinkCount(factory, 'IronPlate', 1)
      calculateFactories([factory], gameData)

      expect(factory.parts.IronPlate.amountRemaining).toBe(0)
      expect(showDisposalControls(factory, 'IronPlate')).toBe(true)
    })

    it('hides both controls for a fluid: neither building has a pipe input', () => {
      const oil = newFactory('Oil')
      addProductToFactory(oil, { id: 'LiquidFuel', amount: 100, recipe: 'LiquidFuel' })
      calculateFactories([oil], gameData)

      expect(showDisposalControls(oil, 'LiquidFuel')).toBe(true)
      expect(showSinkControl(oil, 'LiquidFuel')).toBe(false)
      expect(showDepotControl(oil, 'LiquidFuel', gameData)).toBe(false)
    })

    // The two exclusions only LOOK alike. The AWESOME Sink refuses radioactive items outright;
    // the Depot has no such objection — the wiki's Radiation page is explicit that uploading a
    // radioactive part stops its radiation, which is a reason players do it deliberately.
    it('offers the depot but not the sink for a radioactive solid', () => {
      const nuclear = newFactory('Nuclear')
      addProductToFactory(nuclear, { id: 'NuclearFuelRod', amount: 1, recipe: 'NuclearFuelRod' })
      addProductToFactory(nuclear, { id: 'NonFissibleUranium', amount: 50, recipe: 'NonFissibleUranium' })
      calculateFactories([nuclear], gameData)

      expect(nuclear.parts.NonFissibleUranium.isSinkable).toBe(false)
      expect(showSinkControl(nuclear, 'NonFissibleUranium')).toBe(false)
      expect(showDepotControl(nuclear, 'NonFissibleUranium', gameData)).toBe(true)
    })

    it('offers the depot on an ordinary solid surplus', () => {
      expect(showDepotControl(factory, 'IronPlate', gameData)).toBe(true)
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

    // Promoted from `note` to `warning` once sinking became expressible: the planner can now
    // answer the problem, so leaving it unanswered is an omission rather than an observation.
    // Pinned because the difference is whether the factory turns amber, which is the whole point.
    it('is a warning that colours the factory amber, but never a problem', () => {
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 10, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: factory.id, outputPart: 'IronPlate', amount: 60 })
      calculateFactories([factory, consumer], gameData)

      const backlog = getFactoryStatuses(factory).find(status => status.type === 'willBacklog')
      expect(backlog).toBeDefined()
      expect(backlog!.severity).toBe('warning')

      // Asserted on the status ALONE rather than on this factory's rollup: the fixture makes
      // plates without supplying its own ingots, so it is legitimately red for a shortage that
      // has nothing to do with the backlog. What matters here is the colour a backlog by itself
      // produces — amber, and never red.
      expect(factoryStatusClass([backlog!])).toEqual({ problem: false, warning: true })
      expect(hasFactoryProblem({ ...factory, products: [], parts: {} } as typeof factory)).toBe(false)
    })

    // The registry is declared in severity order and every display site relies on that rather
    // than sorting, so a warning sitting among the notes would render out of order.
    it('is declared above the note-tier entries', () => {
      const order = factoryStatusDefinitions.map(definition => definition.severity)
      const firstNote = order.indexOf('note')
      expect(order.lastIndexOf('warning')).toBeLessThan(firstNote)
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

  // The two assumptions a sink rests on are invisible in the numbers, so the explainer is the
  // only place they get said. Per browser, because it is the player who needs telling.
  describe('notifySinkTutorial', () => {
    beforeEach(() => {
      localStorage.removeItem(SINK_TUTORIAL_KEY)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('opens the explainer the first time a sink is set', () => {
      const emit = vi.spyOn(eventBus, 'emit')

      notifySinkTutorial(1)

      expect(emit).toHaveBeenCalledWith('openAwesomeSinkTutorial')
      expect(localStorage.getItem(SINK_TUTORIAL_KEY)).toBe('true')
    })

    it('never opens it a second time', () => {
      notifySinkTutorial(1)
      const emit = vi.spyOn(eventBus, 'emit')

      notifySinkTutorial(3)

      expect(emit).not.toHaveBeenCalled()
    })

    // Clearing the field emits null and the spinner can step below its minimum, so only a count
    // that actually landed counts as committing to a sink.
    it.each([0, -1])('says nothing for a count of %s', count => {
      const emit = vi.spyOn(eventBus, 'emit')

      notifySinkTutorial(count)

      expect(emit).not.toHaveBeenCalled()
      expect(localStorage.getItem(SINK_TUTORIAL_KEY)).toBeNull()
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

    // A contributor with nothing spare is kept deliberately: the row is a list of where the
    // Uploaders are, and dropping the ones with no steady surplus would hide Uploaders the user
    // has to go and build.
    it('keeps a contributor at zero', () => {
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
    })

    // Zero spare is reported as zero and nothing more. An Uploader sits on a splitter and takes a
    // share of everything that passes until it is full, so a steady-state surplus of nothing means
    // it fills off the flow rather than that it never fills — flagging it would be wrong.
    it('reports zero rather than a warning when every contributor has nothing spare', () => {
      const factory = platesFactory('Plates', 40)
      const consumer = newFactory('Consumer')
      addProductToFactory(consumer, { id: 'IronPlateReinforced', amount: 5, recipe: 'IronPlateReinforced' })
      addInputToFactory(consumer, { factoryId: factory.id, outputPart: 'IronPlate', amount: 40 })
      calculateFactories([factory, consumer], gameData)
      setDepotCount(factory, 'IronPlate', 1)

      const [entry] = calculateDimensionalDepot([factory])
      expect(entry.totalAmount).toBe(0)
      expect(entry.totalContainers).toBe(1)
    })

    // Sinking zeroes amountRemaining, so reading that would report every sunk-and-depoted item as
    // uploading nothing. The pre-sink figure is what the depot would see.
    it('reads the pre-sink surplus, so a sunk item still reports what it uploads', () => {
      const factory = platesFactory()
      setSinkCount(factory, 'IronPlate', 1)
      calculateFactories([factory], gameData)
      setDepotCount(factory, 'IronPlate', 1)

      const [entry] = calculateDimensionalDepot([factory])
      expect(entry.totalAmount).toBe(100)
    })

    // The two figures are not meant to be added up, so a sink does not reduce this one. The
    // sink takes the whole surplus, and the depot is a finite buffer on the same line whose
    // fill and drain nothing here can know about.
    it('reports the whole surplus whether or not the item is also sunk', () => {
      const sunk = platesFactory('Sunk')
      setSinkCount(sunk, 'IronPlate', 1)
      const notSunk = platesFactory('Not sunk')
      calculateFactories([sunk, notSunk], gameData)
      setDepotCount(sunk, 'IronPlate', 1)
      setDepotCount(notSunk, 'IronPlate', 1)

      const [entry] = calculateDimensionalDepot([sunk, notSunk], depotRateForTier(0))
      expect(entry.sources.find(source => source.name === 'Sunk')?.amount).toBe(100)
      expect(entry.sources.find(source => source.name === 'Not sunk')?.amount).toBe(100)
      expect(entry.uploadCapacity).toBe(30)
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

    // Capacity is per Uploader at the plan's researched speed, so both halves scale it.
    it('scales capacity with the research level and the uploader count', () => {
      const factory = platesFactory('Plates', 600)
      calculateFactories([factory], gameData)
      setDepotCount(factory, 'IronPlate', 3)

      expect(calculateDimensionalDepot([factory], 15)[0].uploadCapacity).toBe(45)
      expect(calculateDimensionalDepot([factory], 240)[0].uploadCapacity).toBe(720)
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

  describe('depot upload research', () => {
    // 15/min doubling four times is the whole progression; a wrong entry here silently changes
    // every capacity figure in the statistics section.
    it('doubles the rate at each of the four upgrades', () => {
      expect(DEPOT_UPLOAD_TIERS.map(tier => tier.rate)).toEqual([15, 30, 60, 120, 240])
    })

    it('costs the Mercer Spheres the MAM asks for', () => {
      expect(DEPOT_UPLOAD_TIERS.map(tier => tier.mercerSpheres)).toEqual([0, 3, 7, 13, 23])
      // The wiki's stated total for the four upload-speed upgrades.
      expect(DEPOT_UPLOAD_TIERS.reduce((total, tier) => total + tier.mercerSpheres, 0)).toBe(46)
    })

    it('defaults to fully researched', () => {
      expect(DEFAULT_DEPOT_TIER).toBe(MAX_DEPOT_TIER)
      expect(depotRateForTier(DEFAULT_DEPOT_TIER)).toBe(240)
    })

    // A select that has been cleared, or a plan hand-edited to something silly, must not make
    // every capacity figure in the section NaN.
    it.each([
      ['a negative', -3, 0],
      ['above the top tier', 99, MAX_DEPOT_TIER],
      ['a NaN', Number.NaN, DEFAULT_DEPOT_TIER],
      ['null', null, DEFAULT_DEPOT_TIER],
      ['a fraction', 2.4, 2],
    ])('clamps %s', (_label, input, expected) => {
      expect(clampTier(input)).toBe(expected)
    })

    it('falls back to the top rate for an out-of-range tier', () => {
      expect(depotRateForTier(99)).toBe(240)
      expect(depotRateForTier(-1)).toBe(15)
    })

    // Two nodes gate the building itself: Mercer Sphere Analysis, then Dimensional Depot. Both are
    // paid before a single Uploader can be placed, whatever tier the save stops at.
    it('charges the unlock at every tier, and the upgrades cumulatively', () => {
      expect(DEPOT_UNLOCK_MERCER_SPHERES).toBe(2)
      expect(DEPOT_UPLOAD_TIERS.map(tier => mercerSpheresForTier(tier.tier))).toEqual([2, 5, 12, 25, 48])
    })

    // The chain is a chain: 240/min cannot be bought without the three upgrades below it, so the
    // cost has to accumulate rather than name the last step's price.
    it('reaches the wiki total for the full upload chain', () => {
      expect(mercerSpheresForTier(MAX_DEPOT_TIER)).toBe(DEPOT_UNLOCK_MERCER_SPHERES + 46)
    })

    it('clamps a nonsense tier rather than reporting a nonsense cost', () => {
      expect(mercerSpheresForTier(99)).toBe(48)
      expect(mercerSpheresForTier(-1)).toBe(2)
    })

    it('names the tier it was given', () => {
      expect(depotTierLabel(0)).toBe('Not researched')
      expect(depotTierLabel(MAX_DEPOT_TIER)).toBe('Upgrade 4')
      expect(depotTierLabel(99)).toBe('Upgrade 4')
    })

    // "MAM research (Not researched): 2" is a sentence arguing with itself. The unlock is still
    // paid at tier 0, so the spend gets its own name there.
    it('names the research spend separately at the unresearched tier', () => {
      expect(depotResearchLabel(0)).toBe('unlock only')
      expect(depotResearchLabel(1)).toBe('Upgrade 1')
      expect(depotResearchLabel(MAX_DEPOT_TIER)).toBe('Upgrade 4')
    })

    // The expansion chain is priced identically to the upload one but bought separately, and it
    // buys stacks rather than speed.
    it('expands the depot one stack at a time', () => {
      expect(DEPOT_EXPANSION_TIERS.map(tier => tier.stacks)).toEqual([1, 2, 3, 4, 5])
      expect(DEPOT_EXPANSION_TIERS.map(tier => mercerSpheresForExpansion(tier.tier))).toEqual([0, 3, 10, 23, 46])
      expect(depotStacksForTier(0)).toBe(1)
      expect(depotStacksForTier(99)).toBe(5)
    })

    // The three lines the statistics offer are derived separately, from the MAM's per-node costs.
    // Ticking all three at full research has to come to what the wiki states for the whole chain,
    // or one of them is counting a node twice or not at all.
    it('reconciles the three research lines against the full chain', () => {
      expect(
        mercerSpheresForTier(MAX_DEPOT_TIER) +
        mercerSpheresForExpansion(MAX_DEPOT_TIER) +
        MANUAL_UPLOADER_MERCER_SPHERES
      ).toBe(DEPOT_RESEARCH_MERCER_SPHERES)
    })
  })
})
