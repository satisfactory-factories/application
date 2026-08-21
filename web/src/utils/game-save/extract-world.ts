/**
 * Turning a parsed save into a WorldSnapshot.
 *
 * Everything here reads as a patch: a property the save does not carry is recorded as null or
 * simply absent, never as a zero. A vanilla save legitimately contains no generation settings and
 * no node overrides at all, and reading that as "this world has nothing" would erase the map.
 */

import type { ParsedSave, SaveObject } from '@/utils/game-save/save-parser'
import {
  asText,
  matchAfter,
  matchAllAfter,
  readEnumProperty,
  readInt32Property,
  readPurityOverride,
  readResourceOverride,
} from '@/utils/game-save/properties'
import { emptyPurityCounts, newWorldSnapshot } from '@/utils/game-save/world-snapshot'
import type {
  NodeTally,
  WorldExtractor,
  WorldResourceCounts,
  WorldSnapshot,
} from '@/utils/game-save/world-snapshot'

const CLASS_NAME = /\.(\w+)_C$/
const RECIPE = /\/Game\/FactoryGame\/Recipes\/[\w/]+\/Recipe_(\w+)\.Recipe_\1_C/g
// Deliberately not anchored on `Schematic_`: MAM research is named `Research_*` and sink shop
// unlocks `ResourceSink_*`, so a `Schematic_`-only pattern silently drops two thirds of them.
const SCHEMATIC = /\/Game\/FactoryGame\/Schematics\/((?:[\w-]+\/)*)([\w-]+)\.\2_C/g
const MILESTONE = /^Schematic_(\d+)-\d+$/
const GAME_PHASE = /GP_Project_Assembly_Phase_(\d+)/
const NODE_REFERENCE = /PersistentLevel\.(BP_(?:ResourceNode|FrackingSatellite|FrackingCore)\w*)/

const SOLID_NODE = 'BP_ResourceNode'
const WELL_SATELLITE = 'BP_FrackingSatellite'
const GEYSER = 'BP_ResourceNodeGeyser'

const CENSUS_CLASSES = [SOLID_NODE, WELL_SATELLITE, 'BP_FrackingCore', GEYSER]

/**
 * Build_X_C becomes x, matching the ids the parser writes into the game data. The two aliases and
 * the `_automated` strip are lifted from parsing/src/buildings.ts, which is what produced those
 * ids: keep them in step or a renamed building silently reads as unbuildable.
 */
const BUILDING_ALIASES: Record<string, string> = {
  generatorgeothermal: 'geothermalgenerator',
  alienpowerbuilding: 'alienpoweraugmenter',
}

export const toBuildingId = (recipeName: string): string => {
  const normalised = recipeName.toLowerCase().replace('_automated', '')
  return BUILDING_ALIASES[normalised] ?? normalised
}

export interface ExtractOptions {
  saveName?: string
  /**
   * Every building id the planner knows, from the game data. Availability is the intersection of
   * these with the save's own build recipes, so a production recipe never masquerades as a
   * building and an unrecognised one is dropped rather than invented.
   */
  buildingIds?: readonly string[]
}

const classOf = (object: SaveObject): string => object.className.match(CLASS_NAME)?.[1] ?? object.className

// `BP_ResourceNodeGeyser` starts with `BP_ResourceNode`, so the trailing dot is load-bearing:
// without it every geyser is counted as a solid node and the census reads 490 instead of 459.
const nodeKind = (object: SaveObject): 'nodes' | 'wells' | null => {
  if (object.className.includes(`${SOLID_NODE}.`)) return 'nodes'
  if (object.className.includes(`${WELL_SATELLITE}.`)) return 'wells'
  return null
}

/**
 * Geysers, counted from the actors themselves. Purity is read in case a future game version ever
 * starts writing it, but on 1.2 it never does, so this reads as a total with an empty split.
 */
const readGeysers = (objects: SaveObject[]): NodeTally => {
  const tally = emptyTally()

  for (const object of objects) {
    if (!object.className.includes(`${GEYSER}.`)) continue
    tally.total++
    const purity = readPurityOverride(asText(object.data))
    if (purity) tally.purity[purity]++
  }

  return tally
}

const emptyTally = (): NodeTally => ({ total: 0, purity: emptyPurityCounts() })
const emptyCounts = (): WorldResourceCounts => ({ nodes: emptyTally(), wells: emptyTally() })

const findByClass = (objects: SaveObject[], fragment: string): SaveObject | undefined =>
  objects.find(object => object.className.includes(fragment))

const readGeneration = (objects: SaveObject[]): WorldSnapshot['generation'] => {
  const gameState = findByClass(objects, 'BP_GameState')
  if (!gameState) return { randomisation: null, purity: null, seed: null }

  const text = asText(gameState.data)
  return {
    randomisation: readEnumProperty(text, 'mNodeRandomization', 'NRM'),
    purity: readEnumProperty(text, 'mNodePuritySettings', 'NPS'),
    seed: readInt32Property(gameState, 'mNodeRandomizationSeed'),
  }
}

/**
 * Node overrides, counted by resource and purity.
 *
 * The two axes move independently: a resource-rich preset rewrites every node's resource while
 * leaving solid-node purity at its default, and an all-pure world does the reverse. A node is
 * only counted under a resource when the save actually named one, because otherwise which
 * resource it holds is a baseline fact this snapshot does not carry.
 */
const readNodes = (objects: SaveObject[]) => {
  const nodes: Record<string, WorldResourceCounts> = {}
  let resourceOverrides = 0
  let purityOverrides = 0

  for (const object of objects) {
    const kind = nodeKind(object)
    if (!kind) continue

    const text = asText(object.data)
    const resource = readResourceOverride(text)
    const purity = readPurityOverride(text)

    if (resource) resourceOverrides++
    if (purity) purityOverrides++
    if (!resource) continue

    const tally = (nodes[resource] ??= emptyCounts())[kind]
    tally.total++
    // The purity half may be absent even here. Counting it as normal would be a guess, so the
    // baseline split for that resource stands instead.
    if (purity) tally.purity[purity]++
  }

  return { nodes, resourceOverrides, purityOverrides }
}

const readProgression = (objects: SaveObject[]): WorldSnapshot['progression'] => {
  const manager = findByClass(objects, 'BP_SchematicManager')
  const phaseManager = findByClass(objects, 'BP_GamePhaseManager')
  const gamePhase = phaseManager ? Number(asText(phaseManager.data).match(GAME_PHASE)?.[1] ?? NaN) : NaN

  const progression: WorldSnapshot['progression'] = {
    milestones: [],
    tiers: [],
    schematicsByFolder: {},
    gamePhase: Number.isNaN(gamePhase) ? null : gamePhase,
  }
  if (!manager) return progression

  const tiers = new Set<number>()
  for (const match of matchAllAfter(asText(manager.data), 'mPurchasedSchematics', SCHEMATIC)) {
    const folder = match[1].replace(/\/$/, '') || 'Root'
    const name = match[2]
    ;(progression.schematicsByFolder[folder] ??= []).push(name)

    const milestone = name.match(MILESTONE)
    if (milestone) {
      progression.milestones.push(name)
      tiers.add(Number(milestone[1]))
    }
  }

  progression.tiers = [...tiers].sort((a, b) => a - b)
  return progression
}

const readRecipes = (objects: SaveObject[]) => {
  const manager = findByClass(objects, 'FGRecipeManager')
  const alternates: string[] = []
  const standard: string[] = []
  if (!manager) return { alternates, standard }

  for (const match of matchAllAfter(asText(manager.data), 'mAvailableRecipes', RECIPE)) {
    const name = match[1]
    if (name.startsWith('Alternate_')) alternates.push(name.slice('Alternate_'.length))
    else standard.push(name)
  }

  return { alternates, standard }
}

/**
 * Extractors already placed, and the node each sits on. A water pump draws from open water rather
 * than a node, so a null nodePath is ordinary here rather than a parse failure.
 */
const readExtractors = (objects: SaveObject[]): WorldExtractor[] => {
  const extractors: WorldExtractor[] = []

  for (const object of objects) {
    const text = asText(object.data)
    if (!text.includes('mExtractableResource')) continue

    extractors.push({
      building: classOf(object),
      nodePath: matchAfter(text, 'mExtractableResource', NODE_REFERENCE)?.[1] ?? null,
    })
  }

  return extractors
}

const readCensus = (objects: SaveObject[]): Record<string, number> => {
  const census: Record<string, number> = {}
  for (const name of CENSUS_CLASSES) census[name] = 0

  for (const object of objects) {
    for (const name of CENSUS_CLASSES) {
      if (object.className.includes(`${name}.`)) census[name]++
    }
  }

  return census
}

export const extractWorld = (parsed: ParsedSave, options: ExtractOptions = {}): WorldSnapshot => {
  const { objects } = parsed
  const { nodes, resourceOverrides, purityOverrides } = readNodes(objects)
  const recipes = readRecipes(objects)

  const known = new Set(options.buildingIds ?? [])
  const buildings = [...new Set(recipes.standard.map(toBuildingId))].filter(id => known.has(id))

  return {
    ...newWorldSnapshot(),
    saveName: options.saveName ?? '',
    generation: readGeneration(objects),
    nodes,
    hasNodeOverrides: resourceOverrides > 0 || purityOverrides > 0,
    progression: readProgression(objects),
    recipes,
    geysers: readGeysers(objects),
    buildings: buildings.sort(),
    extractors: readExtractors(objects),
    objectCounts: readCensus(objects),
  }
}
