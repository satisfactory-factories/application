import { randomInt } from 'node:crypto'

/**
 * Three-word invite slugs. Deliberately bland, game-flavoured words: the slug is
 * read aloud and pasted into chat, so it has to be unambiguous and inoffensive.
 */
const SLUG_WORDS = [
  'alloy', 'amber', 'anchor', 'assembler', 'basalt', 'beacon', 'belt', 'blender',
  'boulder', 'cable', 'canyon', 'cavern', 'circuit', 'cobalt', 'compass', 'conveyor',
  'copper', 'coral', 'crystal', 'cyan', 'delta', 'dune', 'ember', 'engine',
  'ficsit', 'foundry', 'frame', 'gantry', 'geyser', 'girder', 'glacier', 'granite',
  'harbour', 'heater', 'hub', 'ingot', 'iron', 'lattice', 'limestone', 'magnet',
  'mesa', 'meadow', 'motor', 'nickel', 'nitrogen', 'nozzle', 'orbit', 'pillar',
  'piston', 'plateau', 'pylon', 'quartz', 'quarry', 'reactor', 'refinery', 'ridge',
  'rotor', 'rubber', 'silica', 'smelter', 'solder', 'spire', 'steel', 'sulfur',
  'summit', 'terrace', 'thermal', 'tundra', 'turbine', 'valve', 'vector', 'welder',
] as const

export const SLUG_WORD_COUNT = 3

export const generateSlug = (): string =>
  Array.from({ length: SLUG_WORD_COUNT }, () => SLUG_WORDS[randomInt(SLUG_WORDS.length)]).join('-')
