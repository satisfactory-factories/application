import { beforeEach, describe, expect, it } from 'vitest'
import {
  BuildingGroup,
  Factory,
  FactoryItem,
  FactoryPowerChangeType,
  ItemType,
} from '@/interfaces/planner/FactoryInterface'
import { fetchGameData } from '@/utils/gameDataService'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import {
  getSomersloopIngredientFactor,
  getSomersloopOutputMultiplier,
  getSomersloopPowerMultiplier,
  getSomersloopSlots,
  sanitizeGroupSomersloops,
} from '@/utils/factory-management/building-groups/somersloops'
import {
  calculateEffectiveBuildingCount,
  remainderToNewGroup,
  updateBuildingGroupViaPart,
} from '@/utils/factory-management/building-groups/common'

const gameData = await fetchGameData()

const makeGroup = (overrides: Partial<BuildingGroup> = {}): BuildingGroup => ({
  id: 1,
  type: ItemType.Product,
  buildingCount: 1,
  overclockPercent: 100,
  somersloops: 0,
  parts: {},
  powerUsage: 0,
  powerProduced: 0,
  ...overrides,
})

describe('somersloops', () => {
  describe('getSomersloopSlots', () => {
    it('should return the wiki slot counts per building', () => {
      expect(getSomersloopSlots('smeltermk1')).toBe(1)
      expect(getSomersloopSlots('constructormk1')).toBe(1)
      expect(getSomersloopSlots('assemblermk1')).toBe(2)
      expect(getSomersloopSlots('foundrymk1')).toBe(2)
      expect(getSomersloopSlots('oilrefinery')).toBe(2)
      expect(getSomersloopSlots('converter')).toBe(2)
      expect(getSomersloopSlots('manufacturermk1')).toBe(4)
      expect(getSomersloopSlots('blender')).toBe(4)
      expect(getSomersloopSlots('hadroncollider')).toBe(4)
      expect(getSomersloopSlots('quantumencoder')).toBe(4)
    })

    it('should return 0 for buildings that cannot be amplified', () => {
      expect(getSomersloopSlots('packager')).toBe(0)
      expect(getSomersloopSlots('generatorfuel')).toBe(0)
      expect(getSomersloopSlots('generatornuclear')).toBe(0)
      expect(getSomersloopSlots('')).toBe(0)
      expect(getSomersloopSlots('someUnknownBuilding')).toBe(0)
    })
  })

  describe('getSomersloopOutputMultiplier', () => {
    it('should return 1 with no somersloops', () => {
      expect(getSomersloopOutputMultiplier(makeGroup(), 'smeltermk1')).toBe(1)
    })

    it('should return 2 for a fully slooped single-slot building', () => {
      expect(getSomersloopOutputMultiplier(makeGroup({ somersloops: 1 }), 'smeltermk1')).toBe(2)
    })

    it('should return fractional boosts for partially filled multi-slot buildings', () => {
      expect(getSomersloopOutputMultiplier(makeGroup({ somersloops: 1 }), 'assemblermk1')).toBe(1.5)
      expect(getSomersloopOutputMultiplier(makeGroup({ somersloops: 2 }), 'assemblermk1')).toBe(2)
      expect(getSomersloopOutputMultiplier(makeGroup({ somersloops: 1 }), 'manufacturermk1')).toBe(1.25)
      expect(getSomersloopOutputMultiplier(makeGroup({ somersloops: 3 }), 'manufacturermk1')).toBe(1.75)
    })

    it('should return 1 for buildings without slots regardless of somersloops set', () => {
      expect(getSomersloopOutputMultiplier(makeGroup({ somersloops: 4 }), 'generatorfuel')).toBe(1)
    })
  })

  describe('getSomersloopPowerMultiplier', () => {
    it('should square the output multiplier', () => {
      expect(getSomersloopPowerMultiplier(makeGroup(), 'smeltermk1')).toBe(1)
      expect(getSomersloopPowerMultiplier(makeGroup({ somersloops: 1 }), 'smeltermk1')).toBe(4)
      expect(getSomersloopPowerMultiplier(makeGroup({ somersloops: 1 }), 'assemblermk1')).toBe(2.25)
      expect(getSomersloopPowerMultiplier(makeGroup({ somersloops: 2 }), 'assemblermk1')).toBe(4)
    })
  })

  describe('sanitizeGroupSomersloops', () => {
    it('should clamp somersloops to the slot count', () => {
      const group = makeGroup({ somersloops: 5 })
      expect(sanitizeGroupSomersloops(group, 'smeltermk1')).toBe(1)
      expect(group.somersloops).toBe(1)
    })

    it('should clamp negative values to 0', () => {
      const group = makeGroup({ somersloops: -3 })
      expect(sanitizeGroupSomersloops(group, 'assemblermk1')).toBe(0)
      expect(group.somersloops).toBe(0)
    })

    it('should round fractional values to whole somersloops', () => {
      const group = makeGroup({ somersloops: 1.4 })
      expect(sanitizeGroupSomersloops(group, 'assemblermk1')).toBe(1)
    })

    it('should treat missing or invalid values as 0', () => {
      expect(sanitizeGroupSomersloops(makeGroup({ somersloops: undefined }), 'smeltermk1')).toBe(0)
      expect(sanitizeGroupSomersloops(makeGroup({ somersloops: NaN }), 'smeltermk1')).toBe(0)
    })

    it('should not wipe stored somersloops for an unknown building name', () => {
      const group = makeGroup({ somersloops: 2 })
      expect(sanitizeGroupSomersloops(group, '')).toBe(0)
      expect(group.somersloops).toBe(2) // preserved — building not yet resolved
    })

    it('should zero stored somersloops on known non-amplifiable buildings', () => {
      const group = makeGroup({ somersloops: 2 })
      expect(sanitizeGroupSomersloops(group, 'generatorfuel')).toBe(0)
      expect(group.somersloops).toBe(0)
    })
  })

  describe('getSomersloopIngredientFactor', () => {
    it('should return 1 with no groups or no somersloops', () => {
      expect(getSomersloopIngredientFactor(undefined, 'smeltermk1')).toBe(1)
      expect(getSomersloopIngredientFactor([], 'smeltermk1')).toBe(1)
      expect(getSomersloopIngredientFactor([makeGroup({ buildingCount: 3 })], 'smeltermk1')).toBe(1)
    })

    it('should return 0.5 for fully slooped single-slot groups', () => {
      const groups = [makeGroup({ buildingCount: 2, somersloops: 1 })]
      expect(getSomersloopIngredientFactor(groups, 'smeltermk1')).toBe(0.5)
    })

    it('should weight mixed groups by their effective building count', () => {
      // Group A: 1 building fully slooped (physical 1, output 2)
      // Group B: 1 building plain (physical 1, output 1)
      // Factor = 2 physical / 3 output
      const groups = [
        makeGroup({ buildingCount: 1, somersloops: 1 }),
        makeGroup({ id: 2, buildingCount: 1 }),
      ]
      expect(getSomersloopIngredientFactor(groups, 'smeltermk1')).toBeCloseTo(2 / 3, 10)
    })
  })

  describe('calculateEffectiveBuildingCount with somersloops', () => {
    it('should count a fully slooped building as double output', () => {
      const groups = [makeGroup({ buildingCount: 2, somersloops: 1 })]
      expect(calculateEffectiveBuildingCount(groups, 'smeltermk1')).toBe(4)
    })

    it('should stack somersloops with overclocking', () => {
      // 2 buildings @ 150% with full sloops = 2 * 1.5 * 2 = 6 effective
      const groups = [makeGroup({ buildingCount: 2, overclockPercent: 150, somersloops: 1 })]
      expect(calculateEffectiveBuildingCount(groups, 'smeltermk1')).toBe(6)
    })
  })
})

describe('somersloops in factory calculations', () => {
  let mockFactory: Factory
  let factories: Factory[]
  let product: FactoryItem
  let group: BuildingGroup

  beforeEach(() => {
    mockFactory = newFactory('Somersloop Factory')
    factories = [mockFactory]

    addProductToFactory(mockFactory, {
      id: 'IronIngot',
      amount: 60, // 2 smelters
      recipe: 'IngotIron',
    })
    product = mockFactory.products[0]
    calculateFactories(factories, gameData)
    group = product.buildingGroups[0]
  })

  describe('group parts', () => {
    it('should double the output of a fully slooped group without changing ingredients', () => {
      product.buildingGroupItemSync = false
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      // 2 smelters @ 100% + 1 sloop each: 120 ingots out, still only 60 ore in
      expect(group.parts.IronIngot).toBe(120)
      expect(group.parts.OreIron).toBe(60)
    })

    it('should stack somersloop output with overclocking', () => {
      product.buildingGroupItemSync = false
      group.somersloops = 1
      group.overclockPercent = 150
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      // 2 buildings * 1.5 clock * 30/min * 2 sloop boost = 180 out; ore = 2 * 1.5 * 30 = 90
      expect(group.parts.IronIngot).toBe(180)
      expect(group.parts.OreIron).toBe(90)
    })
  })

  describe('group power', () => {
    it('should quadruple power for a fully slooped single-slot building', () => {
      product.buildingGroupItemSync = false
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      // 2 smelters * 4MW * (1 + 1/1)^2 = 32 MW
      expect(group.powerUsage).toBe(32)
    })

    it('should stack the sloop power penalty with the overclock power exponent', () => {
      product.buildingGroupItemSync = false
      group.somersloops = 1
      group.overclockPercent = 250
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      // Per building: 4MW * 2.5^1.321928 * 4 = 53.7263 MW (~13.43x base, per the wiki)
      const expectedPerBuilding = 4 * Math.pow(2.5, 1.321928) * 4
      expect(group.powerUsage).toBeCloseTo(expectedPerBuilding * 2, 2)
      expect(group.powerUsage / (4 * 2)).toBeCloseTo(13.43, 2)
    })

    it('should flow slooped group power into the factory power totals', () => {
      product.buildingGroupItemSync = false
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      expect(mockFactory.power.consumed).toBe(32)
    })
  })

  describe('sync ON: item writeback', () => {
    it('should update the product amount to the amplified output', () => {
      product.buildingGroupItemSync = true
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup', useBuildingGroupBuildings: true })

      // 2 buildings @ 100% fully slooped = 4 effective buildings = 120/min
      expect(product.amount).toBe(120)
      expect(product.buildingRequirements.amount).toBe(4)
      expect(group.parts.IronIngot).toBe(120)
      expect(group.parts.OreIron).toBe(60)
    })

    it('should discount the item ingredient demand to what the machines actually consume', () => {
      product.buildingGroupItemSync = true
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup', useBuildingGroupBuildings: true })

      // 120 ingots/min amount-derived demand would be 120 ore, but the 2 physical
      // smelters only eat 60.
      expect(product.requirements.OreIron.amount).toBe(60)
      expect(mockFactory.parts.OreIron.amountRequired).toBe(60)
    })
  })

  describe('sync OFF: item untouched', () => {
    it('should not change the product amount or building requirements', () => {
      product.buildingGroupItemSync = false
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      expect(product.amount).toBe(60)
      expect(product.buildingRequirements.amount).toBe(2)
      // The group over-produces (4 effective vs 2 required), flagged as out of sync
      expect(product.buildingGroupsHaveProblem).toBe(true)
    })
  })

  describe('rebalancing with somersloops (origin item, sync ON)', () => {
    it('should need half the physical buildings when fully slooped', () => {
      product.buildingGroupItemSync = true
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup', useBuildingGroupBuildings: true })
      // Now at 120/min with 2 slooped buildings. User asks for 120/min from the item side:
      product.amount = 120
      calculateFactories(factories, gameData)

      // 120/min needs 4 effective buildings; with a 2x sloop boost that is 2 physical.
      expect(group.buildingCount).toBe(2)
      expect(group.overclockPercent).toBe(100)
      expect(group.somersloops).toBe(1)
      expect(group.parts.IronIngot).toBe(120)
    })

    it('should underclock a fractional physical target', () => {
      product.buildingGroupItemSync = true
      group.somersloops = 1
      product.amount = 90 // 3 effective buildings; boost 2 => 1.5 physical => 2 buildings @ 75%
      calculateFactories(factories, gameData)

      expect(group.buildingCount).toBe(2)
      expect(group.overclockPercent).toBe(75)
      expect(group.parts.IronIngot).toBe(90)
      expect(group.parts.OreIron).toBe(45)
    })
  })

  describe('updateBuildingGroupViaPart with somersloops', () => {
    it('should account for the boosted output rate when editing the product part', () => {
      product.buildingGroupItemSync = false
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      // 120/min of a slooped smelter (60/min each) = 2 buildings @ 100%
      updateBuildingGroupViaPart(group, product, ItemType.Product, mockFactory, 'IronIngot', 120)

      expect(group.buildingCount).toBe(2)
      expect(group.overclockPercent).toBe(100)
    })

    it('should use the unboosted rate when editing an ingredient part', () => {
      product.buildingGroupItemSync = false
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      // 60 ore/min at 30 ore/building = 2 buildings regardless of sloops
      updateBuildingGroupViaPart(group, product, ItemType.Product, mockFactory, 'OreIron', 60)

      expect(group.buildingCount).toBe(2)
      expect(group.overclockPercent).toBe(100)
      // Which then produce double output
      expect(group.parts.IronIngot).toBe(120)
    })
  })

  describe('remainderToNewGroup with somersloops', () => {
    it('should only ask the new group to cover the output the slooped group does not', () => {
      product.buildingGroupItemSync = false
      product.amount = 120 // requires 4 effective buildings
      calculateFactories(factories, gameData)

      // Slim the existing group down to 1 fully slooped building = 2 effective
      group.buildingCount = 1
      group.somersloops = 1
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      remainderToNewGroup(product, ItemType.Product, mockFactory)

      // Remaining 2 effective buildings, new group has no sloops => 2 physical @ 100%
      const newGroup = product.buildingGroups[1]
      expect(product.buildingGroups.length).toBe(2)
      expect(newGroup.buildingCount).toBe(2)
      expect(newGroup.overclockPercent).toBe(100)
    })
  })

  describe('multi-slot buildings', () => {
    it('should apply fractional boosts on an assembler recipe', () => {
      addProductToFactory(mockFactory, {
        id: 'IronPlateReinforced',
        amount: 5, // 1 assembler
        recipe: 'IronPlateReinforced',
      })
      const ripProduct = mockFactory.products[1]
      calculateFactories(factories, gameData)

      ripProduct.buildingGroupItemSync = false
      const ripGroup = ripProduct.buildingGroups[0]
      ripGroup.somersloops = 1 // 1 of 2 slots = +50%
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      expect(ripGroup.parts.IronPlateReinforced).toBe(7.5)
      expect(ripGroup.parts.IronPlate).toBe(30)
      expect(ripGroup.parts.IronScrew).toBe(60)
      // 15MW * (1.5)^2 = 33.75 MW
      expect(ripGroup.powerUsage).toBe(33.75)
    })
  })

  describe('power producers cannot be amplified', () => {
    it('should ignore somersloops set on a generator group', () => {
      addPowerProducerToFactory(mockFactory, {
        building: 'generatorfuel',
        ingredientAmount: 20,
        recipe: 'GeneratorFuel_LiquidFuel',
        updated: FactoryPowerChangeType.Ingredient,
      })
      calculateFactories(factories, gameData)

      const producer = mockFactory.powerProducers[0]
      const producerGroup = producer.buildingGroups[0]
      const originalPower = producerGroup.powerProduced

      producerGroup.somersloops = 2
      calculateFactories(factories, gameData, { origin: 'buildingGroup' })

      expect(producerGroup.somersloops).toBe(0) // sanitized away — no slots
      expect(producerGroup.powerProduced).toBe(originalPower)
    })
  })
})
