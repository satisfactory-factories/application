/**
 * sinkable.ts — whether the AWESOME Sink will take a part.
 *
 * It matters because it decides how bad an unwanted byproduct is. Plastic backing up in an oil
 * factory is a nuisance you can fix by sinking the overflow; Heavy Oil Residue or Plutonium Waste
 * backing up is a wall, because neither can be sunk and the line simply stops.
 *
 * Three exclusions:
 *
 * - **Fluids.** The sink has no pipe input. (Packaging first makes the packaged variant sinkable,
 *   which is a different part and takes the normal rule.)
 * - **Radioactive items.** Hardcoded until the parser exposes `sinkPoints`, at which point the rule
 *   becomes `!isFluid && sinkPoints > 0` — Docs.json confirms that encodes these exclusions, and
 *   the fuel rod exceptions, exactly. See `.claude/plans/awesome-sink-and-byproduct-routing.md`,
 *   which owns this rule; the sink feature itself will want this module.
 * - **A short, hand-verified list of ordinary solids.** Not radioactive, not a fluid, but the
 *   AWESOME Sink still refuses them in game. `mResourceSinkPoints` in Docs.json is `0` for these
 *   too, but 0 there is NOT sufficient on its own to prove a part is unsinkable — Alien DNA
 *   Capsule is also 0 despite being sinkable (it pays out on a separate "coupon" counter rather
 *   than ordinary sink points), so every entry below is cross-checked against
 *   https://satisfactory.wiki.gg rather than trusted from the data field alone. Membership is
 *   deliberately manual and narrow rather than "every part whose recipe output leaves it at 0
 *   sink points", to avoid silently miscategorising the next Alien-DNA-Capsule-shaped exception.
 *   https://github.com/satisfactory-factories/application/issues/594.
 */
import { DataInterface } from '@/interfaces/DataInterface'

// Uranium Waste and everything derived from it. The fuel rods are absent on purpose: they carry
// sink points in game, so they can be sunk.
export const RADIOACTIVE_PARTS = new Set([
  'NuclearWaste',
  'PlutoniumWaste',
  'NonFissibleUranium',
  'PlutoniumPellet',
  'PlutoniumCell',
  'Ficsonium',
  'FicsoniumFuelRod',
])

// See the module comment above for why this list is manual rather than derived from sink points.
export const NON_SINKABLE_PARTS = new Set([
  'CrystalShard', // Power Shard.
  'AlienProtein', // Reachable via the Hog/Spitter/Stinger/Hatcher Protein recipes.
])

export const isSinkablePart = (partId: string, gameData: DataInterface): boolean => {
  if (!partId || !gameData) return false
  if (RADIOACTIVE_PARTS.has(partId)) return false
  if (NON_SINKABLE_PARTS.has(partId)) return false
  return !gameData.items.parts[partId]?.isFluid
}
