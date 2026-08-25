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
 * - **Power Shards.** Not radioactive and not a fluid, but `Desc_CrystalShard_C.mResourceSinkPoints`
 *   is 0 in Docs.json — the game keeps a valuable item out of the sink on purpose so it cannot be
 *   thrown away by accident. https://github.com/satisfactory-factories/application/issues/594.
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

// Ordinary, non-radioactive solids the sink refuses anyway. Currently just the Power Shard
// (`CrystalShard`) — see the module comment above.
export const NON_SINKABLE_PARTS = new Set([
  'CrystalShard',
])

export const isSinkablePart = (partId: string, gameData: DataInterface): boolean => {
  if (!partId || !gameData) return false
  if (RADIOACTIVE_PARTS.has(partId)) return false
  if (NON_SINKABLE_PARTS.has(partId)) return false
  return !gameData.items.parts[partId]?.isFluid
}
