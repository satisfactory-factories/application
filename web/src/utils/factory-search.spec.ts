import { describe, expect, it } from 'vitest'
import { Factory, FactoryPowerChangeType } from '@/interfaces/planner/FactoryInterface'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory } from '@/utils/factory-management/inputs'
import { addPowerProducerToFactory } from '@/utils/factory-management/power'
import { gameData } from '@/utils/gameData'
import {
  buildPlanSearchIndex,
  hasResults,
  PartSearchRole,
  PartUsageKind,
  searchPlan,
  usageJumpTarget,
} from '@/utils/factory-search'

// A small but complete plan: an ore mine feeding a smelter, the smelter feeding a plate line, and
// a nuclear plant producing waste nobody wants. Between them they cover every usage kind.
const buildPlan = (): Factory[] => {
  const mine = newFactory('Iron Mine', 0, 1)
  addProductToFactory(mine, { id: 'OreIron', amount: 240, recipe: 'Extract_OreIron' })

  const smelter = newFactory('Ingot Smelter', 1, 2)
  addProductToFactory(smelter, { id: 'IronIngot', amount: 240, recipe: 'IngotIron' })
  addInputToFactory(smelter, { factoryId: mine.id, outputPart: 'OreIron', amount: 240 })

  const plates = newFactory('Plate Works', 2, 3)
  addProductToFactory(plates, { id: 'IronPlate', amount: 120, recipe: 'IronPlate' })
  addInputToFactory(plates, { factoryId: smelter.id, outputPart: 'IronIngot', amount: 180 })

  // Needs Iron Rods nothing in the plan makes: pure demand, the weakest usage there is.
  const rotors = newFactory('Rotor Line', 3, 4)
  addProductToFactory(rotors, { id: 'Rotor', amount: 60, recipe: 'Rotor' })

  const plan = [mine, smelter, plates, rotors]
  calculateFactories(plan, gameData)
  return plan
}

const index = () => buildPlanSearchIndex(buildPlan())

const usageFor = (partId: string, factoryName: string) =>
  index().usages.get(partId)?.find(usage => usage.factory.name === factoryName)

describe('factory-search', () => {
  describe('buildPlanSearchIndex', () => {
    it('should record a product as production for the factory making it', () => {
      expect(usageFor('IronPlate', 'Plate Works')).toMatchObject({
        kind: PartUsageKind.Produced,
        amount: 120,
      })
    })

    it('should record an import, carrying the source factory the row is addressed by', () => {
      expect(usageFor('IronIngot', 'Plate Works')).toMatchObject({
        kind: PartUsageKind.Imported,
        amount: 180,
        sourceFactoryId: 2,
      })
    })

    it('should record an export for the factory shipping the part out', () => {
      expect(usageFor('OreIron', 'Iron Mine')?.kind).toBe(PartUsageKind.Produced)
      expect(usageFor('IronIngot', 'Ingot Smelter')?.kind).toBe(PartUsageKind.Produced)
      // The smelter's ore is imported and consumed; the import is the stronger of the two.
      expect(usageFor('OreIron', 'Ingot Smelter')?.kind).toBe(PartUsageKind.Imported)
    })

    it('should record a raw shortage as demand, so the ore is still findable', () => {
      const smelter = newFactory('Solo Smelter', 0, 9)
      addProductToFactory(smelter, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
      const plan = [smelter]
      calculateFactories(plan, gameData)

      // Nothing mines or imports the ore, so all the factory does with it is need it.
      expect(buildPlanSearchIndex(plan).usages.get('OreIron')?.[0].kind)
        .toBe(PartUsageKind.Consumed)
    })

    it('should record a power producer byproduct nothing else knows about', () => {
      const nuclear = newFactory('Nuclear', 0, 7)
      addPowerProducerToFactory(nuclear, {
        building: 'generatornuclear',
        powerAmount: 2500,
        recipe: 'GeneratorNuclear_NuclearFuelRod',
        updated: FactoryPowerChangeType.Power,
      })
      const plan = [nuclear]
      calculateFactories(plan, gameData)

      expect(buildPlanSearchIndex(plan).usages.get('NuclearWaste')?.[0].kind)
        .toBe(PartUsageKind.Byproduct)
    })

    it('should list a part only once per factory, under its strongest usage', () => {
      const entries = index().usages.get('IronIngot') ?? []
      const names = entries.map(entry => entry.factory.name)

      expect(new Set(names).size).toBe(names.length)
    })

    it('should order a part\'s factories by usage priority', () => {
      const entries = index().usages.get('IronIngot') ?? []

      expect(entries.map(entry => [entry.factory.name, entry.kind])).toEqual([
        ['Ingot Smelter', PartUsageKind.Produced],
        ['Plate Works', PartUsageKind.Imported],
      ])
    })
  })

  describe('searchPlan', () => {
    it('should return nothing for an empty query', () => {
      const results = searchPlan('   ', index())

      expect(hasResults(results)).toBe(false)
    })

    it('should match factory names fuzzily', () => {
      const results = searchPlan('plate wo', index())

      expect(results.factories.map(match => match.factory.name)).toEqual(['Plate Works'])
    })

    it('should group a part\'s factories production first, then other usage', () => {
      const [part] = searchPlan('iron ingot', index()).parts

      expect(part.partName).toBe('Iron Ingot')
      expect(part.groups.map(group => group.role)).toEqual([
        PartSearchRole.Production,
        PartSearchRole.Other,
      ])
      expect(part.groups[0].usages.map(usage => usage.factory.name)).toEqual(['Ingot Smelter'])
      expect(part.groups[1].usages.map(usage => usage.factory.name)).toEqual(['Plate Works'])
      expect(part.factoryCount).toBe(2)
    })

    it('should find a part from its internal name, pasted in', () => {
      expect(searchPlan('IronPlate', index()).parts[0].partId).toBe('IronPlate')
    })

    it('should rank the closest part match first', () => {
      const parts = searchPlan('iron ingot', index()).parts

      expect(parts[0].partName).toBe('Iron Ingot')
    })

    it('should cap results and report what it dropped', () => {
      const results = searchPlan('iron', index(), { maxParts: 1, maxUsagesPerRole: 1 })

      expect(results.parts).toHaveLength(1)
      expect(results.hiddenParts).toBeGreaterThan(0)
    })

    it('should report the factories a group could not show', () => {
      const results = searchPlan('iron ingot', index(), { maxUsagesPerRole: 0 })
      const [part] = results.parts

      // Every group is empty, so none of them are rendered at all...
      expect(part.groups).toHaveLength(0)
      // ...but the part still knows how many factories it is about.
      expect(part.factoryCount).toBe(2)
    })
  })

  describe('usageJumpTarget', () => {
    const target = (partId: string, factoryName: string) =>
      usageJumpTarget(partId, usageFor(partId, factoryName)!)

    it('should aim a production result at the product row', () => {
      expect(target('IronPlate', 'Plate Works')).toEqual({
        targets: ['3-products-item-IronPlate'],
        fallback: '3-products',
      })
    })

    it('should aim an import result at the import row it came from', () => {
      expect(target('IronIngot', 'Plate Works')).toEqual({
        targets: ['3-import-2-IronIngot'],
        fallback: '3-imports',
      })
    })

    it('should aim everything else at the part\'s satisfaction row', () => {
      expect(target('IronRod', 'Rotor Line')).toEqual({
        targets: ['4-satisfaction-item-IronRod'],
        fallback: '4-satisfaction',
      })
    })

    it('should fall back to the imports section for a half-configured import', () => {
      const factory = newFactory('Half Done', 0, 8)
      addInputToFactory(factory, { factoryId: null, outputPart: 'IronPlate', amount: 10 })

      const usage = buildPlanSearchIndex([factory]).usages.get('IronPlate')![0]

      expect(usageJumpTarget('IronPlate', usage)).toEqual({
        targets: [],
        fallback: '8-imports',
      })
    })
  })
})
