import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  emojiFactoryIcons,
  factoryIconAssetUrl,
  factoryIcons,
  factoryIconSearchText,
  findFactoryIcon,
  gameFactoryIcons,
  popularFactoryIcons,
  resolveFactoryIcon,
} from '@/utils/factory-icons'

const assetsRoot = path.resolve(__dirname, '../../public/assets/game')

describe('factory-icons registry', () => {
  it('has entries', () => {
    expect(factoryIcons.length).toBeGreaterThan(200)
  })

  it('has unique IDs', () => {
    const seen = new Set<string>()
    const duplicates = factoryIcons.filter(entry => {
      if (seen.has(entry.id)) return true
      seen.add(entry.id)
      return false
    })

    expect(duplicates.map(entry => entry.id)).toEqual([])
  })

  it('gives every entry exactly one of an asset or an emoji', () => {
    const malformed = factoryIcons.filter(entry => !!entry.asset === !!entry.emoji)
    expect(malformed.map(entry => entry.id)).toEqual([])
  })

  // The whole point of generating the registry from the filesystem: a missing image fails the
  // suite instead of shipping a broken tile into the picker.
  it('points every game entry at an image that exists', () => {
    const missing = gameFactoryIcons.filter(
      entry => !fs.existsSync(path.join(assetsRoot, `${entry.asset}_64.png`))
    )

    expect(missing.map(entry => entry.id)).toEqual([])
  })

  it('gives every entry a name and a group', () => {
    const incomplete = factoryIcons.filter(entry => !entry.name?.trim() || !entry.group?.trim())
    expect(incomplete.map(entry => entry.id)).toEqual([])
  })

  it('gives every emoji entry search keywords', () => {
    const unkeyworded = emojiFactoryIcons.filter(entry => !entry.keywords?.trim())
    expect(unkeyworded.map(entry => entry.id)).toEqual([])
  })

  it('has a populated popular set that all resolves', () => {
    expect(popularFactoryIcons.length).toBeGreaterThan(20)
    const unresolved = popularFactoryIcons.filter(
      entry => resolveFactoryIcon(entry.id).kind === 'default'
    )
    expect(unresolved.map(entry => entry.id)).toEqual([])
  })

  // The registry deliberately has no FICSMAS entries: their assets were never shipped.
  it('excludes items with no artwork', () => {
    expect(findFactoryIcon('ficsmas-gift')).toBeUndefined()
  })
})

describe('resolveFactoryIcon', () => {
  it('resolves a game asset', () => {
    expect(resolveFactoryIcon('iron-ingot')).toEqual({
      kind: 'image',
      asset: 'item/iron-ingot',
      name: 'Iron Ingot',
    })
  })

  it('resolves a building to a friendly ID', () => {
    expect(resolveFactoryIcon('smelter')).toEqual({
      kind: 'image',
      asset: 'building/smeltermk1',
      name: 'Smelter',
    })
  })

  it('resolves an emoji', () => {
    expect(resolveFactoryIcon('sq-blue')).toEqual({
      kind: 'emoji',
      char: '🟦',
      name: 'Blue square',
    })
  })

  it.each([
    ['an unknown ID', 'not-a-real-icon'],
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
    // A hand-edited share link must not be able to put anything on screen but a known icon.
    ['an injected emoji character', '🟦'],
    ['an injected asset path', 'item/iron-ingot'],
  ])('falls back to the default for %s', (_label, id) => {
    expect(resolveFactoryIcon(id)).toEqual({ kind: 'default' })
  })
})

describe('factoryIconAssetUrl', () => {
  it('uses the small image at or below 64px', () => {
    expect(factoryIconAssetUrl('item/iron-ingot', 24)).toBe('/assets/game/item/iron-ingot_64.png')
    expect(factoryIconAssetUrl('item/iron-ingot', 64)).toBe('/assets/game/item/iron-ingot_64.png')
  })

  it('uses the large image above 64px', () => {
    expect(factoryIconAssetUrl('item/iron-ingot', 96)).toBe('/assets/game/item/iron-ingot_256.png')
  })
})

describe('factoryIconSearchText', () => {
  it('includes the keywords so emoji are findable by colour and shape', () => {
    const blueSquare = findFactoryIcon('sq-blue')!
    expect(factoryIconSearchText(blueSquare)).toContain('blue')
    expect(factoryIconSearchText(blueSquare)).toContain('square')
  })

  it('is just the name when there are no keywords', () => {
    expect(factoryIconSearchText({ id: 'x', name: 'Iron Ingot', group: 'Components' }))
      .toBe('Iron Ingot')
  })
})
