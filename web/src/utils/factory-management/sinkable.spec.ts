import { describe, expect, test } from 'vitest'
import { isSinkablePart, NON_SINKABLE_PARTS, RADIOACTIVE_PARTS } from '@/utils/factory-management/sinkable'
import { gameData } from '@/utils/gameData'

describe('sinkable', () => {
  test('takes an ordinary solid', () => {
    expect(isSinkablePart('Plastic', gameData)).toBe(true)
    expect(isSinkablePart('IronPlate', gameData)).toBe(true)
  })

  // The sink has no pipe input.
  test('refuses fluids', () => {
    for (const part of ['Water', 'LiquidOil', 'HeavyOilResidue', 'NitrogenGas']) {
      expect(isSinkablePart(part, gameData)).toBe(false)
    }
  })

  test('refuses radioactive items', () => {
    for (const part of RADIOACTIVE_PARTS) {
      expect(isSinkablePart(part, gameData)).toBe(false)
    }
  })

  // They carry sink points in game, unlike everything else down that chain.
  test('takes the fuel rods, which are the exception', () => {
    expect(isSinkablePart('NuclearFuelRod', gameData)).toBe(true)
    expect(isSinkablePart('PlutoniumFuelRod', gameData)).toBe(true)
  })

  test('every radioactive part named still exists in the game data', () => {
    for (const part of RADIOACTIVE_PARTS) {
      expect(gameData.items.parts[part]).toBeDefined()
    }
  })

  // https://github.com/satisfactory-factories/application/issues/594 — Power Shards are neither
  // a fluid nor radioactive, but Docs.json still gives them 0 sink points: the game deliberately
  // keeps a valuable item out of the sink.
  test('refuses Power Shards, even though they are an ordinary non-radioactive solid', () => {
    expect(gameData.items.parts.CrystalShard?.isFluid).toBe(false)
    expect(RADIOACTIVE_PARTS.has('CrystalShard')).toBe(false)
    expect(isSinkablePart('CrystalShard', gameData)).toBe(false)
  })

  test('every non-sinkable part named still exists in the game data', () => {
    for (const part of NON_SINKABLE_PARTS) {
      expect(gameData.items.parts[part]).toBeDefined()
    }
  })

  test('is false rather than throwing without a part or without data', () => {
    expect(isSinkablePart('', gameData)).toBe(false)
    expect(isSinkablePart('Plastic', undefined as never)).toBe(false)
  })
})
