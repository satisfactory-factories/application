import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, calculateFactory, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import {
  addCustomBuildingToFactory,
  calculateCustomBuildings,
  deleteCustomBuilding,
  getCustomBuildingData,
  getCustomBuildingIcon,
  getCustomBuildingPower,
} from '@/utils/factory-management/custom-buildings'
import { getBuildingDisplayName } from '@/utils/factory-management/common'
import { setSyncState } from '@/utils/factory-management/syncState'
import { gameData } from '@/utils/gameData'
import fs from 'node:fs'
import path from 'node:path'

describe('custom buildings', () => {
  let factory: Factory

  beforeEach(() => {
    factory = newFactory('Portal Room')
  })

  describe('game data', () => {
    it('should offer buildings that produce nothing', () => {
      expect(getCustomBuildingData('portal', gameData)).toEqual({
        name: 'portal',
        displayName: 'Main Portal',
        power: 250,
        ingredients: [{ part: 'SingularityCell', perMin: 2 }],
      })
      expect(getCustomBuildingData('trainstation', gameData)?.power).toBe(50)
    })

    it('should not offer production buildings', () => {
      expect(getCustomBuildingData('constructormk1', gameData)).toBeUndefined()
      expect(getCustomBuildingData('generatorcoal', gameData)).toBeUndefined()
    })

    it('should return nothing when no building has been chosen', () => {
      expect(getCustomBuildingData('', gameData)).toBeUndefined()
    })

    // The display name map has no game data to read, so it is a hand-kept mirror of it.
    it('should have a display name for every custom building', () => {
      gameData.customBuildings.forEach(building => {
        expect(getBuildingDisplayName(building.name)).toBe(building.displayName)
      })
    })
  })

  describe('icons', () => {
    // Drawn from the item icon set, so a typo is a broken image rather than a failure.
    it('should point every icon at a file that exists', () => {
      const assets = path.resolve(__dirname, '../../../public/assets/game/item')

      gameData.customBuildings.forEach(building => {
        const icon = getCustomBuildingIcon(building.name)
        if (!icon) {
          return
        }

        expect(fs.existsSync(path.join(assets, `${icon}_64.png`)), icon).toBe(true)
        expect(fs.existsSync(path.join(assets, `${icon}_256.png`)), icon).toBe(true)
      })
    })

    // The game ships no icon for these two in either set; they fall back to a glyph.
    it('should know which buildings have no icon', () => {
      const iconless = gameData.customBuildings
        .filter(building => !getCustomBuildingIcon(building.name))
        .map(building => building.name)

      expect(iconless).toEqual(['fluidtruckstation', 'elevator'])
    })
  })

  describe('addCustomBuildingToFactory', () => {
    it('should add a custom building with a count of one by default', () => {
      addCustomBuildingToFactory(factory, { building: 'radartower' })

      expect(factory.customBuildings.length).toBe(1)
      expect(factory.customBuildings[0].building).toBe('radartower')
      expect(factory.customBuildings[0].amount).toBe(1)
      expect(factory.customBuildings[0].displayOrder).toBe(0)
    })

    it('should add an empty custom building when nothing is chosen yet', () => {
      addCustomBuildingToFactory(factory)

      expect(factory.customBuildings[0].building).toBe('')
      expect(factory.customBuildings[0].ingredients).toEqual([])
    })

    it('should order buildings as they are added', () => {
      addCustomBuildingToFactory(factory, { building: 'radartower' })
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 4 })

      expect(factory.customBuildings.map(building => building.displayOrder)).toEqual([0, 1])
      expect(factory.customBuildings[1].amount).toBe(4)
    })
  })

  describe('deleteCustomBuilding', () => {
    it('should delete the building and re-order the rest', () => {
      addCustomBuildingToFactory(factory, { building: 'radartower' })
      addCustomBuildingToFactory(factory, { building: 'portal' })
      addCustomBuildingToFactory(factory, { building: 'trainstation' })

      deleteCustomBuilding(0, factory)

      expect(factory.customBuildings.map(building => building.building)).toEqual(['portal', 'trainstation'])
      expect(factory.customBuildings.map(building => building.displayOrder)).toEqual([0, 1])
    })
  })

  describe('calculateCustomBuildings', () => {
    it('should calculate power and upkeep from the count', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 10 })
      calculateFactories([factory], gameData)

      expect(factory.customBuildings[0].powerConsumed).toBe(2500)
      expect(factory.customBuildings[0].ingredients).toEqual([
        { part: 'SingularityCell', perMin: 20 },
      ])
    })

    it('should give buildings with no upkeep no ingredients', () => {
      addCustomBuildingToFactory(factory, { building: 'trainstation', amount: 3 })
      calculateFactories([factory], gameData)

      expect(factory.customBuildings[0].powerConsumed).toBe(150)
      expect(factory.customBuildings[0].ingredients).toEqual([])
    })

    it('should rebuild the upkeep when the count changes', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 10 })
      calculateFactories([factory], gameData)

      factory.customBuildings[0].amount = 3
      calculateFactories([factory], gameData)

      expect(factory.customBuildings[0].powerConsumed).toBe(750)
      expect(factory.customBuildings[0].ingredients[0].perMin).toBe(6)
    })

    it('should clamp a negative count to zero', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: -5 })
      calculateFactories([factory], gameData)

      expect(factory.customBuildings[0].amount).toBe(0)
      expect(factory.customBuildings[0].powerConsumed).toBe(0)
      expect(factory.customBuildings[0].ingredients[0].perMin).toBe(0)
    })

    it('should leave a building the user has not chosen yet alone', () => {
      addCustomBuildingToFactory(factory)
      calculateFactories([factory], gameData)

      expect(factory.customBuildings[0].powerConsumed).toBe(0)
      expect(factory.power.consumed).toBe(0)
    })

    // A plan saved with a building the game data no longer carries must not take the plan down.
    it('should warn and zero a building missing from the game data', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      addCustomBuildingToFactory(factory, { building: 'nonexistentbuilding', amount: 5 })
      calculateFactories([factory], gameData)

      expect(warn).toHaveBeenCalled()
      expect(factory.customBuildings[0].powerConsumed).toBe(0)
      expect(factory.customBuildings[0].ingredients).toEqual([])
      warn.mockRestore()
    })

    // Plans saved before custom buildings existed have no array at all.
    it('should tolerate a factory with no customBuildings array', () => {
      const legacy = newFactory('Legacy')
      delete (legacy as Partial<Factory>).customBuildings
      calculateCustomBuildings(legacy, gameData)

      expect(legacy.customBuildings).toEqual([])
    })
  })

  describe('power', () => {
    it('should add the draw to the factory power consumption', () => {
      addProductToFactory(factory, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 2 })
      calculateFactories([factory], gameData)

      // One Smelter at 4MW, plus 2 portals at 250MW each.
      expect(factory.power.consumed).toBe(504)
      expect(factory.power.consumedMin).toBe(504)
      expect(factory.power.consumedMax).toBe(504)
      expect(getCustomBuildingPower(factory)).toBe(500)
    })

    it('should count the draw in a factory with nothing else in it', () => {
      addCustomBuildingToFactory(factory, { building: 'portalsatellite', amount: 4 })
      calculateFactories([factory], gameData)

      expect(factory.power.consumed).toBe(1000)
      expect(factory.buildingRequirements.portalsatellite.amount).toBe(4)
    })
  })

  describe('building requirements', () => {
    it('should add custom buildings to the factory building requirements', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 10 })
      addCustomBuildingToFactory(factory, { building: 'trainstation', amount: 2 })
      calculateFactories([factory], gameData)

      expect(factory.buildingRequirements.portal).toEqual({
        name: 'portal',
        amount: 10,
        powerConsumed: 2500,
      })
      expect(factory.buildingRequirements.trainstation.amount).toBe(2)
    })

    it('should sum two entries of the same building', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 4 })
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 6 })
      calculateFactories([factory], gameData)

      expect(factory.buildingRequirements.portal.amount).toBe(10)
      expect(factory.buildingRequirements.portal.powerConsumed).toBe(2500)
    })

    // A fractional count used to price 2.5 portals' power against 3 portals' build cost. There is
    // no clock on any of these buildings, so the count is rounded up once, in the engine, and
    // every derived figure follows it.
    it('should round a fractional count up to whole buildings, and cost them all', () => {
      addCustomBuildingToFactory(factory, { building: 'radartower', amount: 2.5 })
      calculateFactories([factory], gameData)

      expect(factory.customBuildings[0].amount).toBe(3)
      expect(factory.buildingRequirements.radartower.amount).toBe(3)
      expect(factory.customBuildings[0].powerConsumed).toBe(90)
      expect(factory.power.consumed).toBe(90)
    })

    it('should charge a fractional portal count its whole upkeep', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 2.5 })
      calculateFactories([factory], gameData)

      expect(factory.customBuildings[0].amount).toBe(3)
      expect(factory.customBuildings[0].powerConsumed).toBe(750)
      expect(factory.parts.SingularityCell.amountRequiredBuildings).toBe(6)
    })

    it('should not list a building the user has not chosen', () => {
      addCustomBuildingToFactory(factory)
      calculateFactories([factory], gameData)

      expect(Object.keys(factory.buildingRequirements)).toEqual([])
    })
  })

  describe('game sync', () => {
    it('should let a factory of nothing but custom buildings be marked in sync, and stay there', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 10 })
      calculateFactories([factory], gameData)

      setSyncState(factory)
      expect(factory.inSync).toBe(true)
      expect(factory.syncStateCustomBuildings[factory.customBuildings[0].id]).toEqual({
        building: 'portal',
        amount: 10,
        ingredientAmount: 20,
      })

      calculateFactories([factory], gameData)
      expect(factory.inSync).toBe(true)
    })

    it('should drop out of sync when the count changes', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 10 })
      calculateFactories([factory], gameData)
      setSyncState(factory)

      factory.customBuildings[0].amount = 11
      calculateFactories([factory], gameData)

      expect(factory.inSync).toBe(false)
    })

    it('should drop out of sync when the building is swapped for another', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 4 })
      calculateFactories([factory], gameData)
      setSyncState(factory)

      factory.customBuildings[0].building = 'portalsatellite'
      calculateFactories([factory], gameData)

      expect(factory.inSync).toBe(false)
    })

    it('should drop out of sync when a custom building is added or deleted', () => {
      addProductToFactory(factory, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 2 })
      calculateFactories([factory], gameData)
      setSyncState(factory)

      addCustomBuildingToFactory(factory, { building: 'radartower', amount: 1 })
      calculateFactories([factory], gameData)
      expect(factory.inSync).toBe(false)

      setSyncState(factory)
      expect(factory.inSync).toBe(true)
      deleteCustomBuilding(1, factory)
      calculateFactories([factory], gameData)
      expect(factory.inSync).toBe(false)
    })

    // The half that would have bitten: a factory that also makes something keeps its green badge.
    it('should drop a mixed factory out of sync when only its custom buildings change', () => {
      addProductToFactory(factory, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
      addCustomBuildingToFactory(factory, { building: 'trainstation', amount: 2 })
      calculateFactories([factory], gameData)
      setSyncState(factory)
      expect(factory.inSync).toBe(true)

      factory.customBuildings[0].amount = 5
      calculateFactories([factory], gameData)

      expect(factory.inSync).toBe(false)
    })

    // Nothing to migrate: a plan marked in sync before the feature existed has neither the
    // buildings nor the snapshot, so both sides are zero.
    it('should leave a plan marked in sync before custom buildings existed alone', () => {
      addProductToFactory(factory, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
      calculateFactories([factory], gameData)
      setSyncState(factory)
      delete (factory as Partial<Factory>).syncStateCustomBuildings

      calculateFactories([factory], gameData)

      expect(factory.inSync).toBe(true)
    })
  })

  describe('part demands', () => {
    it('should demand the upkeep, and report it short when nothing supplies it', () => {
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 10 })
      calculateFactories([factory], gameData)

      expect(factory.parts.SingularityCell.amountRequiredBuildings).toBe(20)
      expect(factory.parts.SingularityCell.amountRequired).toBe(20)
      expect(factory.parts.SingularityCell.satisfied).toBe(false)
      expect(factory.requirementsSatisfied).toBe(false)
      expect(factory.hasProblem).toBe(true)
    })

    it('should be satisfied by an import', () => {
      const cellFac = newFactory('Singularity Cells')
      addProductToFactory(cellFac, { id: 'SingularityCell', amount: 20, recipe: 'SingularityCell' })

      addCustomBuildingToFactory(factory, { building: 'portal', amount: 10 })
      addInputToFactory(factory, { factoryId: cellFac.id, outputPart: 'SingularityCell', amount: 20 })

      calculateFactories([cellFac, factory], gameData)

      expect(factory.parts.SingularityCell.satisfied).toBe(true)
      expect(factory.parts.SingularityCell.amountRemaining).toBe(0)
      // And the demand reaches the supplier as an export request.
      expect(cellFac.dependencies.metrics.SingularityCell.request).toBe(20)
      expect(cellFac.dependencies.metrics.SingularityCell.isRequestSatisfied).toBe(true)
    })

    it('should count upkeep alongside production demand for the same part', () => {
      // Portals eat cells the factory is also making — production covers the upkeep.
      addProductToFactory(factory, { id: 'SingularityCell', amount: 20, recipe: 'SingularityCell' })
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 5 })
      calculateFactory(factory, [factory], gameData)

      expect(factory.parts.SingularityCell.amountRequiredBuildings).toBe(10)
      expect(factory.parts.SingularityCell.amountRequiredProduction).toBe(0)
      expect(factory.parts.SingularityCell.amountSuppliedViaProduction).toBe(20)
      expect(factory.parts.SingularityCell.amountRemaining).toBe(10)
      expect(factory.parts.SingularityCell.satisfied).toBe(true)
    })

    it('should make the factory able to import when it has nothing but custom buildings', () => {
      const cellFac = newFactory('Singularity Cells')
      addProductToFactory(cellFac, { id: 'SingularityCell', amount: 20, recipe: 'SingularityCell' })
      addCustomBuildingToFactory(factory, { building: 'portal', amount: 10 })
      calculateFactories([cellFac, factory], gameData)

      expect(factory.parts.SingularityCell.amountRequired).toBe(20)
      expect(factory.parts.SingularityCell.satisfied).toBe(false)
    })
  })
})
