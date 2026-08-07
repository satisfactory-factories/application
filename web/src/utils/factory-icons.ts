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
  popular?: boolean
}

export type ResolvedFactoryIcon =
  | { kind: 'image', asset: string, name: string } |
  { kind: 'emoji', char: string, name: string } |
  { kind: 'default' }

export const factoryIcons = registry as FactoryIconEntry[]

const byId = new Map(factoryIcons.map(entry => [entry.id, entry]))

export const popularFactoryIcons = factoryIcons.filter(entry => entry.popular)
export const emojiFactoryIcons = factoryIcons.filter(entry => entry.emoji)
export const gameFactoryIcons = factoryIcons.filter(entry => entry.asset)

export const findFactoryIcon = (id?: string | null): FactoryIconEntry | undefined =>
  id ? byId.get(id) : undefined

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

// Text the picker's search matches against. Game entries get their keywords from the display
// name; emoji need theirs spelled out so a colour or shape finds them.
export const factoryIconSearchText = (entry: FactoryIconEntry): string =>
  `${entry.name} ${entry.keywords ?? ''}`.trim()
