import { describe, expect, it } from 'vitest'
import { buildPartEntries } from '@/utils/parts'
import { DataInterface } from '@/interfaces/DataInterface'

const gameData = {
  buildings: {},
  items: {
    parts: {
      IronIngot: { name: 'Iron Ingot', stackSize: 100, isFluid: false, isFicsmas: false },
      IronPlate: { name: 'Iron Plate', stackSize: 200, isFluid: false, isFicsmas: false },
      Snowball: { name: 'Snowball', stackSize: 100, isFluid: false, isFicsmas: true },
    },
    rawResources: {
      OreIron: { name: 'Iron Ore', limit: 92100 },
    },
  },
  recipes: [
    {
      id: 'IngotIron',
      displayName: 'Iron Ingot',
      ingredients: [{ part: 'OreIron', amount: 1, perMin: 30 }],
      products: [{ part: 'IronIngot', amount: 1, perMin: 30, isByProduct: false }],
      building: { name: 'smeltermk1', power: 4 },
      isAlternate: false,
      isFicsmas: false,
    },
    {
      id: 'IronPlate',
      displayName: 'Iron Plate',
      ingredients: [{ part: 'IronIngot', amount: 3, perMin: 30 }],
      products: [{ part: 'IronPlate', amount: 2, perMin: 20, isByProduct: false }],
      building: { name: 'constructormk1', power: 4 },
      isAlternate: false,
      isFicsmas: false,
    },
    {
      id: 'Alternate_IronIngot',
      displayName: 'Alternate: Pure Iron Ingot',
      ingredients: [{ part: 'OreIron', amount: 7, perMin: 35 }],
      products: [{ part: 'IronIngot', amount: 13, perMin: 65, isByProduct: false }],
      building: { name: 'oilrefinery', power: 30 },
      isAlternate: true,
      isFicsmas: false,
    },
    {
      id: 'Snowball',
      displayName: 'Snowball',
      ingredients: [],
      products: [{ part: 'Snowball', amount: 1, perMin: 10, isByProduct: false }],
      building: { name: 'constructormk1', power: 4 },
      isAlternate: false,
      isFicsmas: true,
    },
  ],
  powerGenerationRecipes: [],
} as unknown as DataInterface

describe('buildPartEntries', () => {
  const entries = buildPartEntries(gameData)
  const byId = Object.fromEntries(entries.map(entry => [entry.id, entry]))

  it('should include parts that are produced or consumed by recipes', () => {
    expect(byId.IronIngot).toBeDefined()
    expect(byId.IronPlate).toBeDefined()
    expect(byId.OreIron).toBeDefined()
  })

  it('should split producers into standard and alternate recipes', () => {
    expect(byId.IronIngot.standardRecipes.map(r => r.id)).toEqual(['IngotIron'])
    expect(byId.IronIngot.alternateRecipes.map(r => r.id)).toEqual(['Alternate_IronIngot'])
  })

  it('should list recipes consuming the part', () => {
    expect(byId.IronIngot.usedIn.map(r => r.id)).toEqual(['IronPlate'])
    expect(byId.OreIron.usedIn.map(r => r.id)).toEqual(['IngotIron', 'Alternate_IronIngot'])
  })

  it('should mark raw resources as having no producers', () => {
    expect(byId.OreIron.standardRecipes).toEqual([])
    expect(byId.OreIron.alternateRecipes).toEqual([])
  })

  it('should resolve display names from parts and raw resources', () => {
    expect(byId.IronIngot.name).toBe('Iron Ingot')
    expect(byId.OreIron.name).toBe('Iron Ore')
  })

  it('should carry the FICSMAS flag from the part data', () => {
    expect(byId.Snowball.isFicsmas).toBe(true)
    expect(byId.IronIngot.isFicsmas).toBe(false)
  })

  it('should sort entries alphabetically by display name', () => {
    const names = entries.map(entry => entry.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})
