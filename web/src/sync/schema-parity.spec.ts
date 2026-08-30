import { beforeEach, describe, expect, it } from 'vitest'
import { parseFactory, parseFactoryTab } from 'common'
import type { FactoryTab } from 'common'
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
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { gameData } from '@/utils/gameData'

/**
 * The zod schemas in `common` strip unknown keys, and they are the only thing between the wire
 * and the database. A stored field the schema has never heard of is therefore deleted from a
 * synced tab by every op, adoption and share — silently, with nothing to notice it by.
 *
 * `common/src/schemas/factory.spec.ts` proves the same thing against a hand-written fixture.
 * This proves it against what the app actually builds: `newFactory()` plus a real calculation
 * pass, with every feature that arrived from main exercised. A field added to the interface and
 * forgotten in the schema fails here even if nobody updates the fixture.
 */
describe('schema parity with what the planner actually stores', () => {
  let factories: Factory[]
  let mine: Factory

  const build = (): Factory[] => {
    const producer = newFactory('Refinery', 0, 1)
    const consumer = newFactory('Assembly', 1, 2)

    addProductToFactory(producer, { id: 'IronIngot', amount: 120, recipe: 'IngotIron' })
    // An extraction group, for `extractorBuilding` and `purity`.
    addProductToFactory(producer, { id: 'OreBauxite', amount: 120, recipe: 'Extract_OreBauxite' })
    // A resource well, for `satellites`.
    addProductToFactory(producer, { id: 'LiquidOil', amount: 60, recipe: 'Extract_LiquidOil_Well' })
    addPowerProducerToFactory(producer, {
      building: 'generatorcoal',
      powerAmount: 75,
      recipe: 'GeneratorCoal_Coal',
      updated: FactoryPowerChangeType.Power,
    })
    // Costs parts to run, which is the only custom building that does.
    addCustomBuildingToFactory(producer, { building: 'portal', amount: 2 })

    consumer.inputs.push({ factoryId: 1, outputPart: 'IronIngot', amount: 60 })

    return [producer, consumer]
  }

  beforeEach(() => {
    factories = build()
    calculateFactories(factories, gameData, { origin: 'recalculate' })
    mine = factories[0]

    // Every user-set field the merge from main introduced, set the way the UI sets it.
    setSinkCount(mine, 'IronIngot', 3)
    setDepotCount(mine, 'IronIngot', 2)

    const extraction = mine.products[1].buildingGroups[0]
    extraction.extractorBuilding = 'minermk2'
    extraction.purity = 'pure'
    mine.products[2].buildingGroups[0].satellites = { impure: 1, normal: 2, pure: 3 }

    setChecklistEnabled(mine, true)
    toggleChecklistProduct(mine, mine.products[0])
    toggleChecklistPowerProducer(mine, mine.powerProducers[0])
    toggleChecklistExport(mine, 2, 'IronIngot', 60)
    toggleChecklistInput(factories[1], factories[1].inputs[0])

    // Stamps syncState, syncStatePower (with its `building`) and syncStateCustomBuildings.
    setSyncState(mine)

    calculateFactories(factories, gameData, { origin: 'recalculate' })
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
    expect(factories[1].inputs[0].completed).toBe(true)
    expect(mine.products[1].buildingGroups[0].purity).toBe('pure')
    expect(mine.products[1].buildingGroups[0].extractorBuilding).toBe('minermk2')
    expect(mine.products[2].buildingGroups[0].satellites).toEqual({ impure: 1, normal: 2, pure: 3 })
    expect(Object.keys(mine.syncStateCustomBuildings)).toHaveLength(1)
    expect(Object.values(mine.syncStatePower)[0].building).toBe('generatorcoal')
    expect(Object.values(mine.parts).some(part => part.amountRequiredSink !== undefined)).toBe(true)
    expect(Object.values(mine.parts).some(part => part.isSinkable !== undefined)).toBe(true)
  })

  it.each([0, 1])('survives truncate + parse with nothing stripped (factory %i)', index => {
    const factory = JSON.parse(JSON.stringify(factories[index])) as Factory
    const parsed = parseFactory(structuredClone(factory))

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(factory)
  })

  it('survives the tab round trip, tab-level settings included', () => {
    const tab: FactoryTab = {
      id: 'f2a0c1b2-0000-4000-8000-000000000001',
      name: 'Round trip',
      factories: JSON.parse(JSON.stringify(factories)) as Factory[],
      powerTarget: 2400,
      depotUploadTier: 1,
      depotExpansionTier: 3,
      plannerVersion: '0.6.0',
      groups: [{ id: 'g-1', name: 'Smelting', color: '#ff0000', order: 0 }],
    }

    const parsed = parseFactoryTab(structuredClone(tab))

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(tab)
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
})
