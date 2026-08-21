/**
 * The typed, versioned facts we keep about a player's world.
 *
 * A save records only what differs from the level defaults, so this is a PATCH, never a
 * replacement for the hand-typed vanilla node table. `nodes` is populated only for resources the
 * save actually overrode; where it is silent the baseline table stands, and
 * `hasNodeOverrides: false` is the flag that says so. Treating an empty `nodes` as "this world
 * has no nodes" would erase the entire map of a vanilla save.
 */

/**
 * Bumped whenever the shape below changes in a way an older snapshot cannot satisfy.
 * A plan carrying a lower version is discarded rather than migrated: re-reading the save is
 * cheap and always correct, and a half-migrated world is worse than no world.
 */
export const WORLD_SNAPSHOT_VERSION = 1

export interface PurityCounts {
  impure: number
  normal: number
  pure: number
}

/**
 * How many nodes of a resource the save named, and how many of those it also gave a purity.
 *
 * The two are separate because the save patches them separately: a resource-rich preset names the
 * resource of all 459 solid nodes while rewriting the purity of none of them. Folding purity into
 * the count would drop those nodes entirely; assuming a purity for them would invent a split the
 * world does not have. `total` is what the save states, `purity` is as much of the breakdown as it
 * gave, and the baseline table supplies the rest.
 */
export interface NodeTally {
  total: number
  purity: PurityCounts
}

export interface WorldResourceCounts {
  // Nodes an extractor sits directly on.
  nodes: NodeTally
  // Satellite micro-nodes inside resource wells.
  wells: NodeTally
}

/** Whether the save gave a purity for every node it named, or the baseline still has to fill in. */
export const isPurityComplete = (tally: NodeTally): boolean =>
  tally.total > 0 && tally.purity.impure + tally.purity.normal + tally.purity.pure === tally.total

export interface WorldGeneration {
  // `NRM_Strict`, `NRM_FossilFuelRich` and friends. Null on a world generated with the defaults,
  // because the game writes nothing when nothing differs.
  randomisation: string | null
  purity: string | null
  seed: number | null
}

export interface WorldProgression {
  // Milestone ids as the game names them, e.g. `Schematic_4-2`.
  milestones: string[]
  // Every tier with at least one milestone bought.
  tiers: number[]
  // Everything else the player has purchased, keyed by the folder it lives in
  // (`Research`, `Alternate`, `Tapes`, `ResourceSink`, ...).
  schematicsByFolder: Record<string, string[]>
  gamePhase: number | null
}

export interface WorldRecipes {
  // Alternate recipe ids without their `Alternate_` prefix.
  alternates: string[]
  // Every other available recipe, buildings included.
  standard: string[]
}

export interface WorldExtractor {
  // The building class, e.g. `Build_MinerMk2`.
  building: string
  // The path name of the node it sits on, or null when the save does not say.
  nodePath: string | null
}

export interface WorldSnapshot {
  version: number
  // When the save was read, so the UI can say how stale the world is.
  readAt: string
  // The player's own name for the save, from the file header.
  saveName: string
  generation: WorldGeneration
  // Only resources the save overrode. Empty on a vanilla world; see hasNodeOverrides.
  nodes: Record<string, WorldResourceCounts>
  // False when the save carried no node overrides at all, i.e. the vanilla layout stands.
  hasNodeOverrides: boolean
  progression: WorldProgression
  recipes: WorldRecipes
  // Building classes the available recipes can construct.
  buildings: string[]
  extractors: WorldExtractor[]
  // Raw object census, the cheapest sanity check that a save parsed correctly.
  objectCounts: Record<string, number>
}

export const emptyPurityCounts = (): PurityCounts => ({ impure: 0, normal: 0, pure: 0 })

/** The canonical shape of a snapshot, in the manner of newFactory(). */
export const newWorldSnapshot = (): WorldSnapshot => ({
  version: WORLD_SNAPSHOT_VERSION,
  readAt: new Date().toISOString(),
  saveName: '',
  generation: { randomisation: null, purity: null, seed: null },
  nodes: {},
  hasNodeOverrides: false,
  progression: { milestones: [], tiers: [], schematicsByFolder: {}, gamePhase: null },
  recipes: { alternates: [], standard: [] },
  buildings: [],
  extractors: [],
  objectCounts: {},
})

/** A snapshot from an older format is not migrated, it is dropped. */
export const isCurrentSnapshot = (snapshot: WorldSnapshot | undefined): snapshot is WorldSnapshot =>
  snapshot?.version === WORLD_SNAPSHOT_VERSION
