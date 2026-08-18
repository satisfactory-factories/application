import { describe, expect, test } from 'vitest'
import { getEndProducts, isEndProductPart } from '@/utils/factory-management/end-products'
import { gameData } from '@/utils/gameData'

describe('end-products', () => {
  const endProducts = getEndProducts(gameData)

  test('names the top of the Space Elevator chain', () => {
    // 10, 11 and 12 are the AI Expansion Server, Ballistic Warp Drive and Biochemical Sculptor.
    expect(endProducts.has('SpaceElevatorPart_12')).toBe(true)
    expect(endProducts.has('SpaceElevatorPart_11')).toBe(true)
  })

  // Smart Plating is an elevator part AND an ingredient of the Modular Engine, so delivering it
  // is not the only thing you can do with it. Only what nothing consumes is the end of a chain.
  test('excludes an elevator part that other recipes consume', () => {
    expect(endProducts.has('SpaceElevatorPart_1')).toBe(false)
  })

  // The trap this module exists for: fuel rods are consumed by power generation rather than by
  // any item recipe, so a set built from item recipes alone calls them end products.
  test('excludes fuel burned by generators', () => {
    expect(endProducts.has('NuclearFuelRod')).toBe(false)
    expect(endProducts.has('PlutoniumFuelRod')).toBe(false)
    expect(endProducts.has('FicsoniumFuelRod')).toBe(false)
  })

  // The Alien Power Matrix is consumed by nothing at all except an Alien Power Augmenter's boost.
  test('excludes the Alien Power Augmenter\'s boost fuel', () => {
    expect(endProducts.has('AlienPowerFuel')).toBe(false)
  })

  test('includes the terminal items that are not elevator parts', () => {
    for (const part of ['NobeliskNuke', 'Rebar_Explosive', 'PortableMiner', 'AlienDNACapsule']) {
      expect(endProducts.has(part)).toBe(true)
    }
  })

  // An ore nothing consumes is a mine with nowhere to send its output, which is the plain
  // no-demand case rather than something the game says is finished.
  test('excludes raw resources', () => {
    for (const part of Object.keys(gameData.items.rawResources)) {
      expect(endProducts.has(part)).toBe(false)
    }
  })

  test('excludes an ordinary intermediate', () => {
    expect(endProducts.has('IronPlate')).toBe(false)
    expect(endProducts.has('Computer')).toBe(false)
  })

  test('caches per game data object rather than rebuilding', () => {
    expect(getEndProducts(gameData)).toBe(endProducts)
  })

  describe('isEndProductPart', () => {
    test('answers for a part id', () => {
      expect(isEndProductPart('SpaceElevatorPart_12', gameData)).toBe(true)
      expect(isEndProductPart('IronPlate', gameData)).toBe(false)
    })

    test('is false rather than throwing without a part or without data', () => {
      expect(isEndProductPart('', gameData)).toBe(false)
      expect(isEndProductPart('IronPlate', undefined as never)).toBe(false)
    })
  })
})
