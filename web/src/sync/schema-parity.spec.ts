import { beforeEach, describe, expect, it } from 'vitest'
import { factoryTabSchema, parseFactory, parseFactoryTab, truncateFactoryTab } from 'common'
import type { FactoryTab } from 'common'
// Reached by path rather than through the `common` barrel: both are test-only, and neither
// belongs in the bundle the barrel produces.
import * as planSchemas from '../../../common/src/schemas/factory'
import { declaredKeys, presentKeys, withoutKey } from '../../../common/src/testing/schema-walk'
import { addCustomBuildingToFactory } from '@/utils/factory-management/custom-buildings'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { addProductToFactory } from '@/utils/factory-management/products'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import {
  setChecklistEnabled,
  toggleChecklistExport,
  toggleChecklistInput,
  toggleChecklistPowerProducer,
  toggleChecklistProduct,
} from '@/utils/factory-management/checklist'
import { setDepotCount, setSinkCount } from '@/utils/factory-management/disposal'
import { setSyncState } from '@/utils/factory-management/syncState'
import {
  addTransportGroup,
  initializeCalculatorFactoryPart,
  initializeCalculatorFactorySettings,
  initializeTransportGroups,
} from '@/utils/factory-management/exportCalculator'
import { createGroup, moveFactoryToGroup } from '@/utils/factory-management/factory-groups'
import { addBuildingGroup } from '@/utils/factory-management/building-groups/common'
import { Factory, FactoryPowerChangeType, ItemType } from '@/interfaces/planner/FactoryInterface'
import { gameData } from '@/utils/gameData'

/**
 * The zod schemas in `common` strip unknown keys, and they are the only thing between the wire
 * and the database. A stored field the schema has never heard of is therefore deleted from a
 * synced tab by every op, adoption and share — silently, with nothing to notice it by.
 *
 * This proves it against what the app actually builds, through the functions the UI calls.
 * A deep-equal round trip only ever covers the keys its input happened to carry, so the input
 * is measured against the schema rather than trusted, and the mutation table at the bottom
 * fails for any key that could be deleted from the schema without this suite noticing.
 */

/**
 * Everything the planner persists, built the way the planner builds it. One function rather
 * than a `beforeEach` so the mutation table can be derived from a plan at module load.
 */
const buildPlan = (): { factories: Factory[], tab: FactoryTab, mine: Factory, consumer: Factory } => {
  const producer = newFactory('Refinery', 0, 1)
  const consumer = newFactory('Assembly', 1, 2)

  addProductToFactory(producer, { id: 'IronIngot', amount: 120, recipe: 'IngotIron' })
  // An extraction group, for `extractorBuilding` and `purity`.
  addProductToFactory(producer, { id: 'OreBauxite', amount: 120, recipe: 'Extract_OreBauxite' })
  // A resource well, for `satellites`.
  addProductToFactory(producer, { id: 'LiquidOil', amount: 60, recipe: 'Extract_LiquidOil_Well' })
  // Leaves Heavy Oil Residue behind, which is what puts by-products on the record.
  addProductToFactory(producer, { id: 'Plastic', amount: 20, recipe: 'Plastic' })
  addPowerProducerToFactory(producer, {
    building: 'generatorcoal',
    powerAmount: 75,
    recipe: 'GeneratorCoal_Coal',
    updated: FactoryPowerChangeType.Power,
  })
  // Uranium Waste, so a producer's `byproduct` is a record rather than null.
  addPowerProducerToFactory(producer, {
    building: 'generatornuclear',
    buildingAmount: 1,
    recipe: 'GeneratorNuclear_NuclearFuelRod',
    updated: FactoryPowerChangeType.Building,
  })
  // The Alien Power Augmenter, the only building the Supply Matrixes toggle applies to.
  addPowerProducerToFactory(producer, {
    building: 'alienpoweraugmenter',
    buildingAmount: 2,
    recipe: 'AlienPowerAugmenter',
    updated: FactoryPowerChangeType.Building,
  })
  // Costs parts to run, which is the only custom building that does.
  addCustomBuildingToFactory(producer, { building: 'portal', amount: 2 })

  consumer.inputs.push({ factoryId: 1, outputPart: 'IronIngot', amount: 60 })

  const factories = [producer, consumer]
  calculateFactories(factories, gameData, { origin: 'recalculate' })

  const mine = factories[0]

  // Every user-set field the merge from main introduced, set the way the UI sets it.
  setSinkCount(mine, 'IronIngot', 3)
  setDepotCount(mine, 'IronIngot', 2)

  const extraction = mine.products[1].buildingGroups[0]
  extraction.extractorBuilding = 'minermk2'
  extraction.purity = 'pure'
  mine.products[2].buildingGroups[0].satellites = { impure: 1, normal: 2, pure: 3 }

  // Somersloops and a hand-dialled clock, then a second group so the split is real.
  const ingots = mine.products[0]
  ingots.buildingGroups[0].somersloops = 1
  ingots.buildingGroups[0].clockSetByUser = true
  ingots.buildingGroups[0].overclockPercent = 137.5
  addBuildingGroup(ingots, ItemType.Product, mine)

  // Production Amplifier: matrix-fed augmenter buildings, which create their own fuel demand.
  mine.powerProducers[2].buildingGroups[0].supplyMatrixes = true

  // Tasks, both states, because `completed` is the half a fixture with no tasks never proves.
  mine.tasks.push({ title: 'Build the smelters', completed: false })
  mine.tasks.push({ title: 'Route the belts', completed: true })
  mine.notes = 'Feeds the assembly line'
  mine.icon = 'iron'

  setChecklistEnabled(mine, true)
  toggleChecklistProduct(mine, ingots)
  toggleChecklistPowerProducer(mine, mine.powerProducers[0])
  toggleChecklistExport(mine, 2, 'IronIngot', 60)
  toggleChecklistInput(consumer, consumer.inputs[0])

  // Stamps syncState, syncStatePower (with its `building`) and syncStateCustomBuildings.
  setSyncState(mine)

  calculateFactories(factories, gameData, { origin: 'recalculate' })

  // The export calculator, opened on an export and given both a belt and a pipe split.
  initializeCalculatorFactoryPart(mine, 'IronIngot')
  initializeCalculatorFactorySettings(mine, 'IronIngot', '2')
  const beltSettings = mine.exportCalculator.IronIngot.factorySettings['2']
  initializeTransportGroups(beltSettings, 60, 'belts')
  addTransportGroup(beltSettings, 60, 'belts')

  initializeCalculatorFactoryPart(mine, 'LiquidOil')
  initializeCalculatorFactorySettings(mine, 'LiquidOil', '2')
  const pipeSettings = mine.exportCalculator.LiquidOil.factorySettings['2']
  initializeTransportGroups(pipeSettings, 300, 'pipes')
  addTransportGroup(pipeSettings, 300, 'pipes')

  const tab: FactoryTab = {
    id: 'f2a0c1b2-0000-4000-8000-000000000001',
    name: 'Round trip',
    factories,
    powerTarget: 2400,
    depotUploadTier: 1,
    depotExpansionTier: 3,
    plannerVersion: '0.7.0',
  }

  // Reorders `factories` in place, so the two are handed back by name rather than by index.
  const group = createGroup(factories, tab, 'Smelting', '#ff0000')
  moveFactoryToGroup(factories, tab, mine.id, group.id)

  return { factories, tab, mine, consumer }
}

/** What the wire and the database actually see: JSON, then the truncate step, then zod. */
const wireCopy = (tab: FactoryTab): FactoryTab =>
  truncateFactoryTab(JSON.parse(JSON.stringify(tab)) as FactoryTab)

const DECLARED = declaredKeys(factoryTabSchema, planSchemas)

/**
 * Keys the schema declares that the planner has never written. Kept in the schema because it is
 * also what a plan stored by an older build is read back through, and listed here rather than
 * silently tolerated: each one is asserted absent below, so a build that starts writing it
 * fails this spec instead of quietly leaving the list stale.
 */
const NEVER_WRITTEN = [
  // PowerItem doubles as the game data's power-recipe ingredient shape, and every rate the
  // planner stores on a producer's ingredients is a `perMin`.
  'powerItemSchema.amount',
  // A product's own building requirement only ever draws power. Generation is counted on the
  // factory's building map instead, where `buildingRequirementSchema.powerProduced` is covered.
  'productBuildingRequirementSchema.powerProduced',
]

const COVERED = DECLARED.filter(key => !NEVER_WRITTEN.includes(key))

describe('schema parity with what the planner actually stores', () => {
  let factories: Factory[]
  let tab: FactoryTab
  let mine: Factory
  let consumer: Factory

  beforeEach(() => {
    ({ factories, tab, mine, consumer } = buildPlan())
  })

  /** Guards the guard: a spec that stopped exercising a field would still pass deep-equal. */
  it('builds a factory that actually carries the new fields', () => {
    expect(mine.partDisposal?.IronIngot).toEqual({ sinks: 3, depots: 2 })
    expect(mine.customBuildings).toHaveLength(1)
    expect(mine.checklistEnabled).toBe(true)
    expect(mine.products[0].completed).toBe(true)
    expect(mine.products[0].checklistSyncedAmount).toBeDefined()
    expect(mine.powerProducers[0].completed).toBe(true)
    expect(mine.checklistExports['2:IronIngot']).toBe(true)
    expect(mine.checklistExportSyncedAmounts['2:IronIngot']).toBe(60)
    expect(consumer.inputs[0].completed).toBe(true)
    expect(mine.products[1].buildingGroups[0].purity).toBe('pure')
    expect(mine.products[1].buildingGroups[0].extractorBuilding).toBe('minermk2')
    expect(mine.products[2].buildingGroups[0].satellites).toEqual({ impure: 1, normal: 2, pure: 3 })
    expect(Object.keys(mine.syncStateCustomBuildings)).toHaveLength(1)
    expect(mine.syncStatePower[mine.powerProducers[0].id].building).toBe('generatorcoal')
    expect(Object.values(mine.parts).some(part => part.amountRequiredSink !== undefined)).toBe(true)
    expect(Object.values(mine.parts).some(part => part.isSinkable !== undefined)).toBe(true)

    // The state no fixture here used to carry, which is what let it be deleted unnoticed.
    expect(mine.tasks).toEqual([
      { title: 'Build the smelters', completed: false },
      { title: 'Route the belts', completed: true },
    ])
    expect(mine.exportCalculator.IronIngot.factorySettings['2'].beltGroups).toHaveLength(2)
    expect(mine.exportCalculator.LiquidOil.factorySettings['2'].pipeGroups).toHaveLength(2)
    expect(mine.products[0].buildingGroups[0].somersloops).toBe(1)
    expect(mine.powerProducers[2].buildingGroups[0].supplyMatrixes).toBe(true)
    expect(mine.powerProducers[1].byproduct).toEqual({ part: 'NuclearWaste', amount: expect.any(Number) })
    expect(mine.products[3].byProducts?.length).toBeGreaterThan(0)
  })

  it.each([0, 1])('survives truncate + parse with nothing stripped (factory %i)', index => {
    const factory = JSON.parse(JSON.stringify(factories[index])) as Factory
    const parsed = parseFactory(structuredClone(factory))

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(factory)
  })

  it('survives the tab round trip, tab-level settings included', () => {
    const wire = wireCopy(tab)
    const parsed = parseFactoryTab(structuredClone(wire))

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(wire)
  })

  // The depot tiers decide what an Uploader moves, so a tab that lost them would report a
  // fully-researched save's capacity for a plan written against an unresearched one.
  it('keeps a zero tier, which is a real setting and not an absent one', () => {
    const parsed = parseFactoryTab({
      id: 'f2a0c1b2-0000-4000-8000-000000000002',
      name: 'Fresh save',
      factories: [],
      depotUploadTier: 0,
      depotExpansionTier: 0,
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.depotUploadTier).toBe(0)
    expect(parsed.data?.depotExpansionTier).toBe(0)
  })

  /**
   * The round trip above can only prove a key survives if the plan carries it. This says the
   * plan carries every key the schema knows about, so a field added to the schema and never
   * round-tripped fails here rather than passing on an input that never mentions it.
   */
  it('exercises every key the schema declares', () => {
    const present = new Set(presentKeys(factoryTabSchema, wireCopy(tab), planSchemas))
    const uncovered = DECLARED.filter(key => !present.has(key))

    expect(uncovered).toEqual(NEVER_WRITTEN)
  })
})

/**
 * Mutation cover. For every key the plan exercises, the same round trip is run against a schema
 * with that one key removed, and has to notice. Without this a key could be deleted from
 * `common/src/schemas/factory.ts` and the suite above would still be green, which is precisely
 * how a field gets stripped at the wire and database boundary with nothing to notice it by.
 */
describe('every schema key is load-bearing', () => {
  const wire = wireCopy(buildPlan().tab)

  it.each(COVERED)('dropping %s from the schema breaks the round trip', key => {
    // Owner labels carry dots of their own (`...requirements.*`), so split on the last one.
    const split = key.lastIndexOf('.')
    const mutant = withoutKey(factoryTabSchema, key.slice(0, split), key.slice(split + 1), planSchemas)
    const parsed = mutant.safeParse(structuredClone(wire))

    expect(parsed.success).toBe(true)
    expect(parsed.data).not.toEqual(wire)
  })
})
