/**
 * factory-icons.ts — resolves a factory's `icon` ID into something renderable.
 *
 * A factory stores a bare ID (`iron-ingot`, `smelter`, `sq-blue`) and nothing else. This module
 * and `src/data/factory-icons.json` own everything about how that ID is drawn, so the asset
 * path, label, grouping and even the emoji behind an ID can change without touching a single
 * saved plan — which matters because plans live in localStorage, Mongo and share links we
 * cannot migrate.
 *
 * Regenerate the registry with `node scripts/generate-factory-icons.mjs` after a game data
 * update. IDs are a public contract: add freely, never rename, never remove.
 */

import registry from '@/data/factory-icons.json'

export interface FactoryIconEntry {
  id: string
  name: string
  // Path under /assets/game, without the size suffix, e.g. 'item/iron-ingot'. Mutually
  // exclusive with `emoji`.
  asset?: string
  emoji?: string
  group: string
  keywords?: string
}

export interface FactoryIconGroup {
  label: string
  entries: FactoryIconEntry[]
}

export type ResolvedFactoryIcon =
  | { kind: 'image', asset: string, name: string } |
  { kind: 'emoji', char: string, name: string } |
  { kind: 'default' }

export const factoryIcons = registry as FactoryIconEntry[]

const byId = new Map(factoryIcons.map(entry => [entry.id, entry]))

export const emojiFactoryIcons = factoryIcons.filter(entry => entry.emoji)
export const gameFactoryIcons = factoryIcons.filter(entry => entry.asset)

// Groups in the order the registry lists them, which is the order the generator's `groupOrder`
// sets — so the picker's tabs are ordered from one place, not two.
export const groupFactoryIcons = (entries: FactoryIconEntry[]): FactoryIconGroup[] => {
  const groups: FactoryIconGroup[] = []

  entries.forEach(entry => {
    const group = groups.find(candidate => candidate.label === entry.group)
    if (group) {
      group.entries.push(entry)
    } else {
      groups.push({ label: entry.group, entries: [entry] })
    }
  })

  return groups
}

// Everything first, so the picker opens on the whole set and browsing by category is a
// narrowing rather than the only way in. Then one tab per game-art group, then a single Emoji
// tab — otherwise squares, circles, shapes, numbers and symbols would be five tabs of their own.
export const factoryIconTabs: FactoryIconGroup[] = [
  { label: 'All', entries: factoryIcons },
  ...groupFactoryIcons(gameFactoryIcons),
  { label: 'Emoji', entries: emojiFactoryIcons },
]

export const findFactoryIcon = (id?: string | null): FactoryIconEntry | undefined =>
  id ? byId.get(id) : undefined

const byAsset = new Map(gameFactoryIcons.map(entry => [entry.asset!, entry]))

// Names for art that has no game data entry behind it — buildings drawn from the item folder,
// UI glyphs. The registry already labels every icon in the picker, so callers get a real name
// instead of falling through to "UNKNOWN PART".
export const findFactoryIconNameByAsset = (asset: string): string | undefined =>
  byAsset.get(asset)?.name

export const resolveFactoryIcon = (id?: string | null): ResolvedFactoryIcon => {
  const entry = findFactoryIcon(id)

  if (entry?.asset) {
    return { kind: 'image', asset: entry.asset, name: entry.name }
  }

  if (entry?.emoji) {
    return { kind: 'emoji', char: entry.emoji, name: entry.name }
  }

  // Unknown IDs fall back silently rather than raising a plan repair — a bad icon is cosmetic,
  // and a hand-edited share link should not be able to put anything else on screen.
  return { kind: 'default' }
}

// The images are only published at these two sizes (see public/assets/game).
export const factoryIconAssetUrl = (asset: string, size: number): string =>
  `/assets/game/${asset}_${size > 64 ? 256 : 64}.png`

// Text the picker's search matches against. Emoji carry explicit keywords so a colour or shape
// finds them; game entries also get punctuation-stripped spellings of their name, because the
// game's own "Mk.5" style otherwise blocks both "mk 5" and "mk5" from matching anything.
export const factoryIconSearchText = (entry: FactoryIconEntry): string => [
  entry.name,
  entry.name.replace(/[.\-_/]+/g, ' '),
  entry.name.replace(/[.\-_/\s]+/g, ''),
  entry.keywords,
].filter(Boolean).join(' ')
