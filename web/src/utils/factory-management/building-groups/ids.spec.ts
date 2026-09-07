// Sync ships whole changed factories, computed by the engine, so the engine has to be a pure
// function of the plan: two clients holding identical data must produce identical output. Minting
// a building group is the one place inside a calculation pass that ever invented a value, so
// these tests pin the id down as reproducible, stable across repeated runs, and unique.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BuildingGroup,
  Factory,
  FactoryItem,
  FactoryPowerChangeType,
  FactoryPowerProducer,
  ItemType,
} from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import {
  addBuildingGroup,
  DETERMINISTIC_GROUP_ID_OFFSET,
  nextBuildingGroupId,
} from '@/utils/factory-management/building-groups/common'
import { gameData } from '@/utils/gameData'

const allGroups = (factory: Factory): BuildingGroup[] => [
  ...factory.products.flatMap(product => product.buildingGroups),
  ...factory.powerProducers.flatMap(producer => producer.buildingGroups),
]

const allGroupIds = (factory: Factory): number[] => allGroups(factory).map(group => group.id)

// An older plan, an imported plan or one joined from a room: valid items, no groups yet. This is
// the state that made the engine mint on load.
const stripGroups = (factory: Factory): Factory => {
  factory.products.forEach(product => { product.buildingGroups = [] })
  factory.powerProducers.forEach(producer => { producer.buildingGroups = [] })
  return factory
}

describe('building group ids', () => {
  let factory: Factory

  beforeEach(() => {
    factory = newFactory('Deterministic ids')
    addProductToFactory(factory, { id: 'IronIngot', amount: 300, recipe: 'IngotIron' })
    addProductToFactory(factory, { id: 'IronPlate', amount: 120, recipe: 'IronPlate' })
    addPowerProducerToFactory(factory, {
      building: 'generatorfuel',
      buildingAmount: 2,
      recipe: 'GeneratorFuel_LiquidFuel',
      updated: FactoryPowerChangeType.Building,
    })
    calculateFactories([factory], gameData)
  })

  describe('reproducibility', () => {
    it('should mint identical ids from two independent engine runs over the same plan', () => {
      const groupless = stripGroups(structuredClone(factory))

      const clientA = structuredClone(groupless)
      const clientB = structuredClone(groupless)

      calculateFactories([clientA], gameData)
      calculateFactories([clientB], gameData)

      expect(allGroupIds(clientA)).toEqual(allGroupIds(clientB))
      // Guards against the assertion above passing on two empty lists.
      expect(allGroupIds(clientA).length).toBe(3)
    })

    it('should mint the same ids every time, over many fresh runs', () => {
      const groupless = stripGroups(structuredClone(factory))

      const results = new Set<string>()
      for (let run = 0; run < 50; run++) {
        const client = structuredClone(groupless)
        calculateFactories([client], gameData)
        results.add(JSON.stringify(allGroupIds(client)))
      }

      // Randomness of any kind puts more than one entry in here: 50 runs of
      // Math.random() * 10000 over three groups collide on all three about never.
      expect(results.size).toBe(1)
    })

    it('should not depend on how many times the engine has already run', () => {
      const groupless = stripGroups(structuredClone(factory))

      const once = structuredClone(groupless)
      calculateFactories([once], gameData)

      const warmed = structuredClone(groupless)
      calculateFactories([warmed], gameData)
      calculateFactories([warmed], gameData)
      calculateFactories([warmed], gameData)

      expect(allGroupIds(warmed)).toEqual(allGroupIds(once))
    })
  })

  describe('idempotency', () => {
    it('should not change ids when the engine runs again', () => {
      const before = allGroupIds(factory)

      calculateFactories([factory], gameData)
      calculateFactories([factory], gameData)

      expect(allGroupIds(factory)).toEqual(before)
    })

    it('should not change ids when a product amount is edited', () => {
      const before = allGroupIds(factory)

      factory.products[0].amount = 600
      calculateFactories([factory], gameData)

      expect(allGroupIds(factory)).toEqual(before)
    })
  })

  describe('ids already in a saved plan', () => {
    it('should leave persisted ids exactly as they are', () => {
      // The shape ids had before they were derived: Math.floor(Math.random() * 10000).
      factory.products[0].buildingGroups[0].id = 4242
      factory.products[1].buildingGroups[0].id = 17
      factory.powerProducers[0].buildingGroups[0].id = 9999

      calculateFactories([factory], gameData)
      calculateFactories([factory], gameData)

      expect(factory.products[0].buildingGroups[0].id).toBe(4242)
      expect(factory.products[1].buildingGroups[0].id).toBe(17)
      expect(factory.powerProducers[0].buildingGroups[0].id).toBe(9999)
    })

    it('should mint above the range legacy ids came from, so the two kinds cannot collide', () => {
      const groupless = stripGroups(structuredClone(factory))
      calculateFactories([groupless], gameData)

      allGroupIds(groupless).forEach(id => {
        expect(id).toBeGreaterThanOrEqual(DETERMINISTIC_GROUP_ID_OFFSET)
      })
    })

    it('should not reuse a legacy id when adding a group beside one', () => {
      const product = factory.products[0]
      product.buildingGroups[0].id = 4242

      addBuildingGroup(product, ItemType.Product, factory)

      expect(product.buildingGroups[0].id).toBe(4242)
      expect(product.buildingGroups[1].id).not.toBe(4242)
    })
  })

  describe('uniqueness', () => {
    it('should be unique across the whole factory, which is where DOM ids are built from', () => {
      const groupless = stripGroups(structuredClone(factory))
      calculateFactories([groupless], gameData)

      const ids = allGroupIds(groupless)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('should stay unique across many groups on the same item', () => {
      const product = factory.products[0]
      for (let index = 0; index < 25; index++) {
        addBuildingGroup(product, ItemType.Product, factory)
      }

      expect(product.buildingGroups.length).toBe(26)
      const ids = allGroupIds(factory)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('should not reissue the id of a group still in the middle of the list', () => {
      const product = factory.products[0]
      addBuildingGroup(product, ItemType.Product, factory)
      addBuildingGroup(product, ItemType.Product, factory)

      // Remove the first group rather than the last, so a count-based ordinal would hand the
      // next group the id the third one is still using.
      const survivors = product.buildingGroups.slice(1).map(group => group.id)
      product.buildingGroups.splice(0, 1)

      addBuildingGroup(product, ItemType.Product, factory)

      const ids = product.buildingGroups.map(group => group.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toEqual(expect.arrayContaining(survivors))
    })

    it('should keep two items apart even when both are minting their first group', () => {
      const groupless = stripGroups(structuredClone(factory))
      calculateFactories([groupless], gameData)

      const first = groupless.products[0].buildingGroups[0].id
      const second = groupless.products[1].buildingGroups[0].id
      expect(first).not.toBe(second)
    })
  })

  describe('nextBuildingGroupId', () => {
    it('should return the same id for the same item every time it is asked', () => {
      const product = factory.products[0]
      const bare = { ...product, buildingGroups: [] } as FactoryItem

      const ids = new Set(
        Array.from({ length: 50 }, () => nextBuildingGroupId(bare, ItemType.Product))
      )

      expect(ids.size).toBe(1)
    })

    it('should key off what the item is, not where it sits in the factory', () => {
      const product = factory.products[0]
      const bare = { ...product, buildingGroups: [] } as FactoryItem
      const expected = nextBuildingGroupId(bare, ItemType.Product)

      const reordered = { ...bare, displayOrder: 7 } as FactoryItem
      expect(nextBuildingGroupId(reordered, ItemType.Product)).toBe(expected)
    })

    it('should separate a product from a power producer carrying the same identity', () => {
      const shared = { id: 'shared', recipe: 'IngotIron', buildingGroups: [] }

      const asProduct = nextBuildingGroupId(shared as unknown as FactoryItem, ItemType.Product)
      const asPower = nextBuildingGroupId(shared as unknown as FactoryPowerProducer, ItemType.Power)

      expect(asProduct).not.toBe(asPower)
    })
  })
})
