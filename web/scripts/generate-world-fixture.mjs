// Generates testing/fixtures/worlds/progressed.json — the world snapshot for a real, played save.
//
// A progressed world is ~10 MB, which does not belong in the repo, so the snapshot it produces is
// committed instead. It is generated through the real parser rather than written by hand, so it
// stays a record of what the game actually wrote.
//
// Run it by hand against a save of your own, then review and commit the diff:
//   node scripts/generate-world-fixture.mjs "/path/to/My World.sav"
//
// Node runs the TypeScript directly; the hook below is only here to resolve the `@/` alias the
// app uses, which Node has no opinion about.

import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.join(here, '..', 'src')
const outFile = path.join(here, '..', 'testing', 'fixtures', 'worlds', 'progressed.json')

registerHooks({
  resolve (specifier, context, next) {
    if (!specifier.startsWith('@/')) return next(specifier, context)
    return { url: pathToFileURL(path.join(srcDir, `${specifier.slice(2)}.ts`)).href, shortCircuit: true }
  },
})

const savePath = process.argv[2]
if (!savePath) {
  console.error('Usage: node scripts/generate-world-fixture.mjs "/path/to/My World.sav"')
  process.exit(1)
}

const { extractWorld } = await import('../src/utils/game-save/extract-world.ts')
const { parseSave } = await import('../src/utils/game-save/save-parser.ts')

const gameDataFile = fs.readdirSync(path.join(here, '..', 'public')).find(f => f.startsWith('gameData_'))
const gameData = JSON.parse(fs.readFileSync(path.join(here, '..', 'public', gameDataFile), 'utf8'))

const bytes = new Uint8Array(fs.readFileSync(savePath))
console.log(`Reading ${path.basename(savePath)} (${(bytes.length / 1e6).toFixed(1)} MB)...`)

const started = Date.now()
const snapshot = extractWorld(await parseSave(bytes), {
  // Deliberately not the player's own file name: the fixture describes the world, and the file
  // it came from is nobody else's business.
  saveName: 'progressed',
  buildingIds: Object.keys(gameData.buildings),
})
console.log(`Parsed in ${Date.now() - started}ms`)

// The timestamp would churn the diff on every regeneration without telling anyone anything.
snapshot.readAt = '1970-01-01T00:00:00.000Z'
// Extractor lists run to thousands of entries and are only interesting in aggregate here, so the
// fixture keeps a census instead of the raw list.
const extractorCensus = {}
for (const extractor of snapshot.extractors) {
  extractorCensus[extractor.building] ??= { total: 0, onNode: 0 }
  extractorCensus[extractor.building].total++
  if (extractor.nodePath) extractorCensus[extractor.building].onNode++
}
snapshot.extractors = []

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, `${JSON.stringify({ ...snapshot, extractorCensus }, null, 2)}\n`)

console.log(`Wrote ${path.relative(path.join(here, '..'), outFile)}`)
console.log(`  phase ${snapshot.progression.gamePhase}, ${snapshot.progression.milestones.length} milestones across tiers ${snapshot.progression.tiers.join(', ')}`)
console.log(`  ${snapshot.recipes.standard.length} recipes, ${snapshot.recipes.alternates.length} alternates`)
console.log(`  ${snapshot.buildings.length} buildings: ${snapshot.buildings.join(', ')}`)
