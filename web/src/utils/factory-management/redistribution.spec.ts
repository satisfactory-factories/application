import { beforeEach, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { create46Scenario } from '@/utils/factory-setups/46-redistribution-hub'
import {
  canRedistributeInput,
  getImportableParts,
  getImportSources,
  getUpstreamFactoryIds,
  wouldCreateLoop,
} from '@/utils/factory-management/redistribution'
import { isImportRedundant } from '@/utils/factory-management/inputs'
import { getFactoryStatuses } from '@/utils/factory-management/status'

let factories: Factory[]
let ironFactory: Factory
let hub: Factory
let reinforced: Factory

describe('redistribution hubs (#46)', () => {
  beforeEach(() => {
    factories = create46Scenario().getFactories()
    ironFactory = findFacByName('Iron Factory', factories)
    hub = findFacByName('Hub', factories)
    reinforced = findFacByName('Reinforced Plates', factories)
    calculateFactories(factories, gameData)
  })

  describe('exports from a hub', () => {
    it('makes a redistributed import exportable', () => {
      expect(hub.parts.IronPlate.exportable).toBe(true)
    })

    it('keeps the consumer import that points at the hub', () => {
      expect(reinforced.inputs).toHaveLength(1)
      expect(reinforced.inputs[0].factoryId).toBe(hub.id)
      expect(hub.dependencies.requests[reinforced.id]?.[0].amount).toBe(60)
    })

    it('leaves the hub with what it did not pass on', () => {
      expect(hub.parts.IronPlate.amountRequiredExports).toBe(60)
      expect(hub.parts.IronPlate.amountRemaining).toBe(40)
      expect(hub.requirementsSatisfied).toBe(true)
    })

    it('goes red when it promises away more than it imports', () => {
      reinforced.inputs[0].amount = 150
      calculateFactories(factories, gameData)

      expect(hub.requirementsSatisfied).toBe(false)
      expect(hub.dependencies.metrics.IronPlate.isRequestSatisfied).toBe(false)
      expect(getFactoryStatuses(hub).map(status => status.type)).toContain('exportShortage')
    })

    it('never calls a redistributed import redundant', () => {
      expect(isImportRedundant(0, hub)).toBe(false)
    })
  })

  describe('an unflagged import', () => {
    it('is not exportable', () => {
      hub.inputs[0].redistribute = false
      calculateFactories(factories, gameData)

      expect(hub.parts.IronPlate.exportable).toBe(false)
    })

    it('takes the imports other factories had from the hub with it', () => {
      hub.inputs[0].redistribute = false
      calculateFactories(factories, gameData)

      expect(reinforced.inputs).toHaveLength(0)
    })
  })

  describe('loops', () => {
    it('follows a hub back to its producer', () => {
      expect(getUpstreamFactoryIds(hub, 'IronPlate', factories)).toEqual(new Set([ironFactory.id]))
    })

    it('never offers a hub part back to the factory that feeds it', () => {
      expect(wouldCreateLoop(ironFactory.id, hub, 'IronPlate', factories)).toBe(true)
      expect(getImportSources(ironFactory, 'IronPlate', factories).map(source => source.factory.id))
        .not.toContain(hub.id)
    })

    it('follows hub-to-hub chains', () => {
      const hubB = findFacByName('Reinforced Plates', factories)
      // Pretend the consumer is a second hub passing plates on.
      hubB.inputs[0].redistribute = true
      calculateFactories(factories, gameData)

      expect(getUpstreamFactoryIds(hubB, 'IronPlate', factories)).toEqual(new Set([hub.id, ironFactory.id]))
      expect(wouldCreateLoop(ironFactory.id, hubB, 'IronPlate', factories)).toBe(true)
      expect(wouldCreateLoop(hub.id, hubB, 'IronPlate', factories)).toBe(true)
    })

    it('refuses to flag a row that would close a loop', () => {
      // Iron Factory imports plates back from the Hub (as saved data could have it).
      ironFactory.inputs.push({ factoryId: hub.id, outputPart: 'IronPlate', amount: 10 })
      expect(canRedistributeInput(ironFactory, ironFactory.inputs[0], factories)).toBe(false)
    })
  })

  describe('import dialog', () => {
    it('lists the hub as a source, with where its stock comes from', () => {
      const sources = getImportSources(reinforced, 'IronPlate', factories)
      const hubSource = sources.find(source => source.factory.id === hub.id)

      expect(hubSource?.via).toEqual(['Iron Factory'])
      expect(hubSource?.alreadyImported).toBe(true)
      // 40 left over, plus the 60 this factory already takes.
      expect(hubSource?.spare).toBe(100)
    })

    it('only offers needed parts unless any surplus is asked for', () => {
      // The hub needs Iron Plates for its exports, and nothing else.
      expect(getImportableParts(hub, factories, false)).toEqual(['IronPlate'])
      expect(getImportableParts(hub, factories, true)).toContain('IronPlateReinforced')
    })
  })
})
