import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fuzzySearch } from '@/utils/fuzzySearch'
import {
  emojiFactoryIcons,
  factoryIconAssetUrl,
  factoryIcons,
  factoryIconSearchText,
  factoryIconTabs,
  findFactoryIcon,
  gameFactoryIcons,
  resolveFactoryIcon,
} from '@/utils/factory-icons'

const assetsRoot = path.resolve(__dirname, '../../public/assets/game')

describe('factory-icons registry', () => {
  it('has entries', () => {
    expect(factoryIcons.length).toBeGreaterThan(300)
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

  it('puts every entry in a tab, with the emoji collected into one', () => {
    const tabbed = factoryIconTabs.flatMap(tab => tab.entries.map(entry => entry.id))

    expect(new Set(tabbed).size).toBe(factoryIcons.length)
    expect(factoryIconTabs.at(-1)?.label).toBe('Emoji')
    expect(factoryIconTabs.at(-1)?.entries).toHaveLength(emojiFactoryIcons.length)
  })

  it('opens on a tab of game art rather than emoji', () => {
    expect(factoryIconTabs[0].label).toBe('Buildings')
    expect(factoryIconTabs[0].entries.every(entry => entry.asset)).toBe(true)
  })

  it('offers the machines, logistics and equipment that game data has no entry for', () => {
    for (const id of [
      'conveyor-belt-mk-5', 'conveyor-lift-mk-3', 'smart-splitter', 'pipeline-pump-mk-2',
      'power-pole-mk-3', 'priority-power-switch', 'jetpack', 'blade-runners', 'hard-drive',
      'miner-mk-3', 'train-station', 'somersloop',
    ]) {
      expect(resolveFactoryIcon(id).kind, id).toBe('image')
    }
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

  // The game writes "Mk.5", so the dot sits exactly where a user types a space or nothing.
  it.each([
    ['conveyor belt mk 5', 'Conveyor Belt Mk.5'],
    ['mk5', 'Conveyor Belt Mk.5'],
    ['pipeline pump mk 2', 'Pipeline Pump Mk.2'],
  ])('finds %s via the punctuation-stripped name', (query, name) => {
    const results = fuzzySearch(query, factoryIcons, factoryIconSearchText)
    expect(results.map(entry => entry.name)).toContain(name)
  })

  it('keeps the plain name in the search text', () => {
    expect(factoryIconSearchText({ id: 'x', name: 'Iron Ingot', group: 'Components' }))
      .toContain('Iron Ingot')
  })
})
