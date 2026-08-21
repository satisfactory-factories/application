---
name: game-save-format
description: "How a Satisfactory 1.2 .sav is read, and the traps that make a parse silently wrong rather than loudly broken"
metadata: 
  node_type: memory
  type: project
  volatility: normal
  lastVerified: 2026-08-21
  originSessionId: 2f384d56-c518-4b8f-935e-a27d6882b8cb
  modified: 2026-08-21T00:06:30.525Z
---

`sav2json@1.0.1` cannot read a 1.2 save. It fails in ~3ms on the save header, before it
decompresses anything. The parser in `web/src/utils/game-save/` is hand-rolled instead. The
dependency is still in `package.json` only because `utils/world-import/worldParser.ts` imports
it; it goes when Part 2 deletes that.

**The chunk header is 49 bytes and the size fields are not where you would guess.** Magic
`c1 83 2a 9e`, then a chunk-size int64, then the algorithm byte at offset 16, then the
compressed size at **offset 17** and uncompressed at 25, each repeated once more. Reading the
sizes 8 bytes late inflates exactly one chunk and looks like a truncated file.

**Header/data alignment is the whole trick.** Object headers are one unbroken run from the
`/Script/FactoryGame.FGWorldSettings` actor; the data section that follows has one block per
object in the same order, so they zip by index. The data section states its own object count —
if it disagrees with the header count, the walk started in the wrong place. That check is worth
more than any amount of defensive parsing, because a misaligned parse reads one object's
properties as another's and every value after it is wrong without erroring.

**A save records only what differs from the level defaults, and the two override axes move
independently.** This is the trap the whole design turns on:

- vanilla world: zero overrides, and the generation properties are simply absent
- fossil-fuel-rich: names the resource of all 577 nodes but writes purity for only the 118 well
  satellites, because the solid nodes kept their default purity
- all-pure world: the exact mirror, 577 purity overrides and zero resource ones

So a snapshot is a **patch over the baseline node table**, never a replacement, and node count
must be stored separately from the purity split (`NodeTally.total` vs `NodeTally.purity`).
Folding them together drops every node whose purity the save left alone.

**Purity is not recoverable from a vanilla save, and geyser purity never is.** Proven by
comparing `vanilla.sav` with `vanilla-all-pure.sav`, which are the same map with every node
forced pure: all 459 node actors are byte-identical in transform and in `mResourcesLeft`, and a
vanilla node's whole data block is one `mResourcesLeft` property. The purity data is created by
the override; without one there is nothing to read. Geysers go further - 31 on every map, zero
properties, and `NPS_AllPure` rewrites all 577 nodes and satellites while leaving them alone. So
vanilla purity and all geyser purity are baseline-table facts, permanently.

**Randomisation presets redistribute well satellites, so a save cannot referee the vanilla well
split.** `NRM_Strict` preserves all eleven solid node counts exactly (that half *is*
save-verifiable) but still moves satellites between resources. Measured: vanilla is Water 55 /
Nitrogen 45 / Oil 18, while Strict reads 55/42/21, fossil 58/41/19 and advanced 54/44/20. All
sum to 118. Trusting a Strict save here would have "corrected" a table that was already right.

The vanilla figures, confirmed against the community map and consistent with every save's object
census: 459 solid nodes, 118 satellites (Water 7/12/36, Nitrogen 2/7/36, Oil 8/6/4) and 31
geysers (9/13/9).

**`BP_ResourceNodeGeyser` starts with `BP_ResourceNode`.** Match on the trailing dot or every
geyser is counted as a solid node and the census reads 490 instead of 459.

**Two name traps that fail silently:**

- Schematics are not all called `Schematic_*`. MAM research is `Research_*` and sink-shop
  unlocks are `ResourceSink_*`. A pattern anchored on `Schematic_` drops two thirds of them and
  takes the entire MAM tree with it.
- A build recipe's name maps to the game data's building id as `lowercase`, minus `_automated`,
  with two aliases (`GeneratorGeoThermal` → `geothermalgenerator`, `AlienPowerBuilding` →
  `alienpoweraugmenter`). Those come from `parsing/src/buildings.ts`, which produced the ids.
  Naive matching reports three buildings as unbuildable that the player can actually build —
  a false negative in the dangerous direction.

The game spells impure `RP_Inpure` in its own asset names. Not a typo to fix.

Sanity counts that hold in every 1.2 world regardless of generation settings: 459
`BP_ResourceNode`, 118 `BP_FrackingSatellite`, 17 `BP_FrackingCore`, 31 `BP_ResourceNodeGeyser`.

Decompression uses the platform `DecompressionStream('deflate')`, so no pako. Feed it a
`ReadableStream`, not a `Blob` — jsdom's Blob has no `stream()` and the specs cannot inflate
through one. Byte params are typed `SaveBytes` (`Uint8Array<ArrayBuffer>`) because
`DecompressionStream` and `DataView` both reject the generic `ArrayBufferLike` form.

A 10 MB save inflates to ~180 MB and parses in under a second, but that is worker work; see
[[calc-engine-gotchas]] for why anything that size stays off the main thread.
