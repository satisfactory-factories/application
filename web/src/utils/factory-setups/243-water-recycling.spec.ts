import { beforeAll, describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, findFacByName } from '@/utils/factory-management/factory'
import { gameData } from '@/utils/gameData'
import { create243Scenario } from '@/utils/factory-setups/243-water-recycling'
import { showRecycledChip } from '@/utils/factory-management/satisfaction'

let factories: Factory[]
let mockFactory: Factory

describe('243 Scenario Plan', () => {
  beforeAll(() => {
    const templateInstance = create243Scenario()
    factories = templateInstance.getFactories()
    mockFactory = findFacByName('Water recycling', factories)
    calculateFactories(factories, gameData)
  })

  describe('Water recycling within the closed loop', () => {
    it('should require the full amount of water for alumina production', () => {
      expect(mockFactory.parts.Water.amountRequired).toBe(1440)
    })

    it('should supply water from the aluminum scrap byproduct', () => {
      expect(mockFactory.parts.Water.amountSuppliedViaProduction).toBe(480)
    })

    // Water is extractable, so the loop's shortfall is a real one — the byproduct covers 480
    // of the 1440 and the rest has to be pumped or imported.
    it('should not top the water shortfall up for free', () => {
      expect(mockFactory.parts.Water.amountSuppliedViaRaw).toBe(0)
    })

    it('should not tell the user to over-feed water into the loop', () => {
      expect(mockFactory.rawResources.Water.amount).toBe(960)
    })

    it('should leave the recycled water short by what the loop cannot recover', () => {
      expect(mockFactory.parts.Water.amountSupplied).toBe(480)
      expect(mockFactory.parts.Water.amountRemaining).toBe(-960)
      expect(mockFactory.parts.Water.satisfied).toBe(false)
    })

    it('should demand the correct amounts of the other raw resources', () => {
      expect(mockFactory.rawResources.OreBauxite.amount).toBe(960)
      expect(mockFactory.rawResources.Coal.amount).toBe(480)
    })

    it('should mark the factory as unsatisfied while the water is unmet', () => {
      expect(mockFactory.requirementsSatisfied).toBe(false)
    })

    it('should flag water as recycled', () => {
      expect(showRecycledChip(mockFactory, 'Water')).toBe(true)
    })

    it('should NOT flag the silica byproduct as recycled, as nothing consumes it', () => {
      expect(showRecycledChip(mockFactory, 'Silica')).toBe(false)
    })
  })
})
