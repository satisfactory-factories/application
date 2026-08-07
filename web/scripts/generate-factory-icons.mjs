// Generates src/data/factory-icons.json — the registry a factory's `icon` ID resolves through.
//
// Run it by hand after regenerating game data (same workflow as the parser), then review and
// commit the diff:  node scripts/generate-factory-icons.mjs
//
// IDs are a public contract: saved plans, share links and cloud saves store them and cannot be
// migrated. Add freely, never rename, never remove — change the `asset`/`emoji` behind an ID
// instead. The script fails on a duplicate ID or a missing asset rather than emitting one.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const assetsRoot = path.join(webRoot, 'public/assets/game')
const outputPath = path.join(webRoot, 'src/data/factory-icons.json')

const dataVersion = fs.readFileSync(path.join(webRoot, 'src/config/config.ts'), 'utf8')
  .match(/dataVersion:\s*'([^']+)'/)?.[1]

if (!dataVersion) {
  throw new Error('Could not read dataVersion from src/config/config.ts')
}

const gameData = JSON.parse(
  fs.readFileSync(path.join(webRoot, `public/gameData_v${dataVersion}.json`), 'utf8')
)

// Same rule GameAssetContent.vue uses to turn a display name into an asset filename.
const sluggify = subject => subject
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .replace(/\s+/g, '-')
  .toLowerCase()

const assetExists = asset => fs.existsSync(path.join(assetsRoot, `${asset}_64.png`))

// ---------------------------------------------------------------------------
// Hand-maintained blocks. Everything else is derived from game data.
// ---------------------------------------------------------------------------

// Buildings are listed rather than derived so the ID reads `smelter`, not `smeltermk1`.
// Every key must exist in gameData.buildings, and every gameData building must be listed.
const buildings = [
  { id: 'smelter', name: 'Smelter', key: 'smeltermk1' },
  { id: 'foundry', name: 'Foundry', key: 'foundrymk1' },
  { id: 'constructor', name: 'Constructor', key: 'constructormk1' },
  { id: 'assembler', name: 'Assembler', key: 'assemblermk1' },
  { id: 'manufacturer', name: 'Manufacturer', key: 'manufacturermk1' },
  { id: 'oil-refinery', name: 'Oil Refinery', key: 'oilrefinery' },
  { id: 'packager', name: 'Packager', key: 'packager' },
  { id: 'blender', name: 'Blender', key: 'blender' },
  { id: 'particle-accelerator', name: 'Particle Accelerator', key: 'hadroncollider' },
  { id: 'quantum-encoder', name: 'Quantum Encoder', key: 'quantumencoder' },
  { id: 'converter', name: 'Converter', key: 'converter' },
  { id: 'biomass-burner', name: 'Biomass Burner', key: 'generatorbiomass' },
  { id: 'coal-generator', name: 'Coal-Powered Generator', key: 'generatorcoal' },
  { id: 'fuel-generator', name: 'Fuel-Powered Generator', key: 'generatorfuel' },
  { id: 'nuclear-power-plant', name: 'Nuclear Power Plant', key: 'generatornuclear' },
  { id: 'geothermal-generator', name: 'Geothermal Generator', key: 'geothermalgenerator' },
  { id: 'alien-power-augmenter', name: 'Alien Power Augmenter', key: 'alienpoweraugmenter' },
]

// Machines, logistics and vehicles the planner has assets for but game data has no entry for.
const extras = [
  { id: 'miner-mk-1', name: 'Miner Mk.1', asset: 'building/miner-mk-1', group: 'Buildings' },
  { id: 'miner-mk-2', name: 'Miner Mk.2', asset: 'building/miner-mk-2', group: 'Buildings' },
  { id: 'miner-mk-3', name: 'Miner Mk.3', asset: 'building/miner-mk-3', group: 'Buildings' },
  { id: 'oil-extractor', name: 'Oil Extractor', asset: 'item/oil-extractor', group: 'Buildings' },
  { id: 'water-extractor', name: 'Water Extractor', asset: 'item/water-extractor', group: 'Buildings' },
  { id: 'resource-well-pressurizer', name: 'Resource Well Pressurizer', asset: 'item/resource-well-pressurizer', group: 'Buildings' },
  { id: 'resource-well-extractor', name: 'Resource Well Extractor', asset: 'item/resource-well-extractor', group: 'Buildings' },
  { id: 'power-storage', name: 'Power Storage', asset: 'building/powerstorage', group: 'Buildings' },

  { id: 'train-station', name: 'Train Station', asset: 'item/train-station', group: 'Logistics' },
  { id: 'truck-station', name: 'Truck Station', asset: 'item/truck-station', group: 'Logistics' },
  { id: 'drone-port', name: 'Drone Port', asset: 'item/drone-port', group: 'Logistics' },
  { id: 'freight-platform', name: 'Freight Platform', asset: 'item/freight-platform', group: 'Logistics' },
  { id: 'fluid-freight-platform', name: 'Fluid Freight Platform', asset: 'item/fluid-freight-platform', group: 'Logistics' },
  { id: 'storage-container', name: 'Storage Container', asset: 'item/storage-container', group: 'Logistics' },
  { id: 'industrial-storage-container', name: 'Industrial Storage Container', asset: 'item/industrial-storage-container', group: 'Logistics' },
  { id: 'fluid-buffer', name: 'Fluid Buffer', asset: 'item/fluid-buffer', group: 'Logistics' },
  { id: 'dimensional-depot', name: 'Dimensional Depot', asset: 'item/dimensional-depot', group: 'Logistics' },
  { id: 'awesome-sink', name: 'AWESOME Sink', asset: 'item/awesome-sink', group: 'Logistics' },
  { id: 'awesome-shop', name: 'AWESOME Shop', asset: 'item/awesome-shop', group: 'Logistics' },
  { id: 'the-hub', name: 'The HUB', asset: 'item/the-hub', group: 'Logistics' },
  { id: 'space-elevator', name: 'Space Elevator', asset: 'item/space-elevator', group: 'Logistics' },
  { id: 'mam', name: 'MAM', asset: 'item/mam', group: 'Logistics' },
  { id: 'blueprint-designer', name: 'Blueprint Designer', asset: 'item/ficsit-blueprints', group: 'Logistics' },

  // Not in game data (never produced or consumed), but the planner counts them and has the art.
  { id: 'somersloop', name: 'Somersloop', asset: 'item/somersloop', group: 'Components' },
  { id: 'mercer-sphere', name: 'Mercer Sphere', asset: 'item/inflated-pocket-dimension', group: 'Components' },

  { id: 'drone', name: 'Drone', asset: 'vehicle/drone', group: 'Vehicles' },
  { id: 'electric-locomotive', name: 'Electric Locomotive', asset: 'vehicle/electric-locomotive', group: 'Vehicles' },
  { id: 'freight-car', name: 'Freight Car', asset: 'vehicle/freight-car', group: 'Vehicles' },
  { id: 'truck', name: 'Truck', asset: 'vehicle/truck', group: 'Vehicles' },
  { id: 'fluid-truck', name: 'Fluid Truck', asset: 'vehicle/fluid-truck', group: 'Vehicles' },
  { id: 'tractor', name: 'Tractor', asset: 'vehicle/tractor', group: 'Vehicles' },
]

// Keywords let the picker's search find a tile by colour or shape as well as by label —
// game entries get theirs from their display name, so only emoji need them spelled out.
const emoji = [
  ...[
    ['red', '🟥'], ['orange', '🟧'], ['yellow', '🟨'], ['green', '🟩'], ['blue', '🟦'],
    ['purple', '🟪'], ['brown', '🟫'], ['black', '⬛'], ['white', '⬜'],
  ].map(([colour, char]) => ({
    id: `sq-${colour}`,
    name: `${colour[0].toUpperCase()}${colour.slice(1)} square`,
    emoji: char,
    group: 'Squares',
    keywords: `${colour} square block colour color`,
  })),

  ...[
    ['red', '🔴'], ['orange', '🟠'], ['yellow', '🟡'], ['green', '🟢'], ['blue', '🔵'],
    ['purple', '🟣'], ['brown', '🟤'], ['black', '⚫'], ['white', '⚪'],
  ].map(([colour, char]) => ({
    id: `ci-${colour}`,
    name: `${colour[0].toUpperCase()}${colour.slice(1)} circle`,
    emoji: char,
    group: 'Circles',
    keywords: `${colour} circle dot round colour color`,
  })),

  { id: 'diamond-orange-large', name: 'Large orange diamond', emoji: '🔶', group: 'Shapes', keywords: 'orange diamond rhombus large' },
  { id: 'diamond-blue-large', name: 'Large blue diamond', emoji: '🔷', group: 'Shapes', keywords: 'blue diamond rhombus large' },
  { id: 'diamond-orange-small', name: 'Small orange diamond', emoji: '🔸', group: 'Shapes', keywords: 'orange diamond rhombus small' },
  { id: 'diamond-blue-small', name: 'Small blue diamond', emoji: '🔹', group: 'Shapes', keywords: 'blue diamond rhombus small' },
  { id: 'diamond-white', name: 'White diamond', emoji: '💠', group: 'Shapes', keywords: 'white blue diamond rhombus' },
  { id: 'triangle-up', name: 'Red triangle up', emoji: '🔺', group: 'Shapes', keywords: 'red triangle up increase' },
  { id: 'triangle-down', name: 'Red triangle down', emoji: '🔻', group: 'Shapes', keywords: 'red triangle down decrease' },
  { id: 'square-outline-white', name: 'White square outline', emoji: '🔳', group: 'Shapes', keywords: 'white square outline button' },
  { id: 'square-outline-black', name: 'Black square outline', emoji: '🔲', group: 'Shapes', keywords: 'black square outline button' },

  ...['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'].map((char, index) => ({
    id: `num-${index}`,
    name: `Number ${index}`,
    emoji: char,
    group: 'Numbers',
    keywords: `${index} number digit`,
  })),
  { id: 'num-10', name: 'Number 10', emoji: '🔟', group: 'Numbers', keywords: '10 ten number digit' },

  { id: 'star', name: 'Star', emoji: '⭐', group: 'Symbols', keywords: 'star favourite favorite important' },
  { id: 'tick', name: 'Tick', emoji: '✅', group: 'Symbols', keywords: 'tick check done complete green' },
  { id: 'exclamation', name: 'Exclamation', emoji: '❗', group: 'Symbols', keywords: 'exclamation important attention red' },
  { id: 'warning', name: 'Warning', emoji: '⚠️', group: 'Symbols', keywords: 'warning caution alert triangle' },
  { id: 'fire', name: 'Fire', emoji: '🔥', group: 'Symbols', keywords: 'fire burn hot fuel' },
  { id: 'bolt', name: 'Lightning bolt', emoji: '⚡', group: 'Symbols', keywords: 'bolt lightning power energy electric' },
  { id: 'recycle', name: 'Recycle', emoji: '♻️', group: 'Symbols', keywords: 'recycle loop reuse green' },
  { id: 'gear', name: 'Gear', emoji: '⚙️', group: 'Symbols', keywords: 'gear cog machine settings' },
  { id: 'factory-emoji', name: 'Factory', emoji: '🏭', group: 'Symbols', keywords: 'factory plant industry' },
  { id: 'crane', name: 'Construction', emoji: '🏗️', group: 'Symbols', keywords: 'crane construction building wip' },
  { id: 'package', name: 'Package', emoji: '📦', group: 'Symbols', keywords: 'package box storage crate' },
  { id: 'truck-emoji', name: 'Truck', emoji: '🚚', group: 'Symbols', keywords: 'truck lorry delivery transport' },
  { id: 'train-emoji', name: 'Train', emoji: '🚂', group: 'Symbols', keywords: 'train rail locomotive transport' },
  { id: 'oil-drum', name: 'Oil drum', emoji: '🛢️', group: 'Symbols', keywords: 'oil drum barrel fuel' },
  { id: 'droplet', name: 'Droplet', emoji: '💧', group: 'Symbols', keywords: 'water droplet fluid liquid blue' },
  { id: 'leaf', name: 'Leaf', emoji: '🌿', group: 'Symbols', keywords: 'leaf plant biomass green nature' },
  { id: 'radiation', name: 'Radiation', emoji: '☢️', group: 'Symbols', keywords: 'radiation nuclear uranium danger' },
  { id: 'flask', name: 'Flask', emoji: '🧪', group: 'Symbols', keywords: 'flask chemical science acid' },
  { id: 'gem', name: 'Gem', emoji: '💎', group: 'Symbols', keywords: 'gem diamond crystal quartz' },
  { id: 'battery-emoji', name: 'Battery', emoji: '🔋', group: 'Symbols', keywords: 'battery power storage charge' },
  { id: 'brick', name: 'Brick', emoji: '🧱', group: 'Symbols', keywords: 'brick concrete wall build' },
  { id: 'pickaxe', name: 'Pickaxe', emoji: '⛏️', group: 'Symbols', keywords: 'pickaxe mine mining ore raw' },
  { id: 'nut-and-bolt', name: 'Nut and bolt', emoji: '🔩', group: 'Symbols', keywords: 'nut bolt screw parts' },
  { id: 'wrench', name: 'Wrench', emoji: '🔧', group: 'Symbols', keywords: 'wrench spanner tool fix' },
  { id: 'hammer', name: 'Hammer', emoji: '🔨', group: 'Symbols', keywords: 'hammer tool build' },
  { id: 'magnet', name: 'Magnet', emoji: '🧲', group: 'Symbols', keywords: 'magnet magnetic iron' },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', group: 'Symbols', keywords: 'rocket launch space elevator fast' },
  { id: 'target', name: 'Target', emoji: '🎯', group: 'Symbols', keywords: 'target goal bullseye aim' },
  { id: 'trophy', name: 'Trophy', emoji: '🏆', group: 'Symbols', keywords: 'trophy award win done' },
  { id: 'lock', name: 'Lock', emoji: '🔒', group: 'Symbols', keywords: 'lock locked secure finished' },
  { id: 'pin', name: 'Pin', emoji: '📌', group: 'Symbols', keywords: 'pin marker location note' },
  { id: 'flag', name: 'Flag', emoji: '🚩', group: 'Symbols', keywords: 'flag marker attention red' },
  { id: 'hourglass', name: 'Hourglass', emoji: '⏳', group: 'Symbols', keywords: 'hourglass time waiting later todo' },
  { id: 'skull', name: 'Skull', emoji: '💀', group: 'Symbols', keywords: 'skull dead broken danger' },
  { id: 'robot', name: 'Robot', emoji: '🤖', group: 'Symbols', keywords: 'robot automation machine' },
  { id: 'alien', name: 'Alien', emoji: '👽', group: 'Symbols', keywords: 'alien somersloop strange' },
  { id: 'snowflake', name: 'Snowflake', emoji: '❄️', group: 'Symbols', keywords: 'snowflake cold ice frozen' },
  { id: 'sun', name: 'Sun', emoji: '☀️', group: 'Symbols', keywords: 'sun bright day power' },
  { id: 'moon', name: 'Moon', emoji: '🌙', group: 'Symbols', keywords: 'moon night dark' },
]

// The Popular tab, in the order it should read. Every ID must exist in the generated set.
const popular = [
  'smelter', 'foundry', 'constructor', 'assembler', 'manufacturer', 'oil-refinery',
  'packager', 'blender', 'particle-accelerator', 'quantum-encoder', 'converter',

  'miner-mk-1', 'miner-mk-2', 'miner-mk-3', 'oil-extractor', 'water-extractor',
  'resource-well-pressurizer',

  'biomass-burner', 'coal-generator', 'fuel-generator', 'nuclear-power-plant',
  'geothermal-generator', 'alien-power-augmenter', 'power-storage',

  'train-station', 'truck-station', 'drone-port', 'storage-container', 'dimensional-depot',
  'awesome-sink', 'space-elevator', 'the-hub',

  'drone', 'electric-locomotive', 'truck', 'tractor',

  'iron-ore', 'copper-ore', 'limestone', 'coal', 'caterium-ore', 'raw-quartz', 'sulfur',
  'bauxite', 'uranium', 'crude-oil', 'water', 'nitrogen-gas', 'sam',

  'iron-ingot', 'copper-ingot', 'steel-ingot', 'caterium-ingot', 'aluminum-ingot',
  'concrete', 'plastic', 'rubber', 'silica', 'quartz-crystal', 'fuel', 'turbofuel',
  'reinforced-iron-plate', 'modular-frame', 'heavy-modular-frame', 'computer',
  'supercomputer', 'motor', 'turbo-motor', 'nuclear-pasta',

  'power-shard', 'somersloop', 'ficsite-ingot',

  'sq-red', 'sq-orange', 'sq-yellow', 'sq-green', 'sq-blue', 'sq-purple',
  'num-1', 'num-2', 'num-3', 'star', 'warning', 'tick', 'bolt', 'pickaxe',
]

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

const entries = []
const errors = []
const byId = new Map()

const add = entry => {
  if (byId.has(entry.id)) {
    const existing = byId.get(entry.id)
    // Coal, Water, Iron Ore and 8 others appear under both parts and rawResources. They are
    // one icon, so the first wins — but anything else sharing an ID is a real clash.
    if (existing.asset !== entry.asset || existing.emoji !== entry.emoji) {
      errors.push(`Duplicate ID "${entry.id}" pointing at different assets: ${existing.asset ?? existing.emoji} vs ${entry.asset ?? entry.emoji}`)
    }
    return
  }
  byId.set(entry.id, entry)
  entries.push(entry)
}

// 1. Buildings, listed above so their IDs read like their names.
const gameBuildings = Object.keys(gameData.buildings)
for (const building of buildings) {
  if (!gameBuildings.includes(building.key)) {
    errors.push(`Building "${building.key}" is no longer in game data`)
    continue
  }
  add({ id: building.id, name: building.name, asset: `building/${building.key}`, group: 'Buildings' })
}
for (const key of gameBuildings) {
  if (!buildings.some(building => building.key === key)) {
    errors.push(`Game data building "${key}" is not listed in this script — add it`)
  }
}

// 2. Extras.
for (const extra of extras) {
  add(extra)
}

// 3. Everything game data knows about that has an image on disk. The existence check is what
// drops the FICSMAS entries — including Gift, whose isFicsmas flag is wrongly false.
const fromGameData = []
for (const [key, raw] of Object.entries(gameData.items.rawResources)) {
  fromGameData.push({ key, name: raw.name, group: 'Raw Resources' })
}
for (const [key, part] of Object.entries(gameData.items.parts)) {
  if (part.isFicsmas) continue
  fromGameData.push({ key, name: part.name, group: part.isFluid ? 'Fluids' : 'Components' })
}

let skipped = 0
for (const item of fromGameData) {
  const asset = `item/${sluggify(item.name)}`
  if (!assetExists(asset)) {
    skipped++
    continue
  }
  add({ id: sluggify(item.name), name: item.name, asset, group: item.group })
}

// 4. Emoji.
for (const entry of emoji) {
  add(entry)
}

// 5. Popular flags, in the listed order.
for (const id of popular) {
  const entry = byId.get(id)
  if (!entry) {
    errors.push(`Popular ID "${id}" does not exist in the generated set`)
    continue
  }
  entry.popular = true
}

// Every image entry must resolve to a file, or the picker shows a broken tile.
for (const entry of entries) {
  if (entry.asset && !assetExists(entry.asset)) {
    errors.push(`Entry "${entry.id}" points at a missing asset: ${entry.asset}_64.png`)
  }
  if (!entry.asset && !entry.emoji) {
    errors.push(`Entry "${entry.id}" has neither an asset nor an emoji`)
  }
}

if (errors.length) {
  console.error(`\nRefusing to write ${path.relative(webRoot, outputPath)}:\n`)
  errors.forEach(error => console.error(`  - ${error}`))
  process.exit(1)
}

// Popular first (in the order listed), then the rest as generated. The picker groups by
// `group` anyway; this just makes the committed file readable.
const popularOrder = new Map(popular.map((id, index) => [id, index]))
entries.sort((a, b) => {
  const aOrder = popularOrder.has(a.id) ? popularOrder.get(a.id) : Infinity
  const bOrder = popularOrder.has(b.id) ? popularOrder.get(b.id) : Infinity
  return aOrder - bOrder
})

const output = entries.map(entry => ({
  id: entry.id,
  name: entry.name,
  ...(entry.asset ? { asset: entry.asset } : { emoji: entry.emoji }),
  group: entry.group,
  ...(entry.keywords ? { keywords: entry.keywords } : {}),
  ...(entry.popular ? { popular: true } : {}),
}))

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)

const images = output.filter(entry => entry.asset).length
console.log(`Wrote ${output.length} icons to ${path.relative(webRoot, outputPath)}`)
console.log(`  ${images} game assets, ${output.length - images} emoji, ${output.filter(e => e.popular).length} popular`)
console.log(`  skipped ${skipped} game data items with no image on disk`)
