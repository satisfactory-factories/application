import { describe, expect, it } from 'vitest'
import { inflateSaveBody, SaveFormatError } from '@/utils/game-save/chunks'
import { loadSaveFixture, SaveFixture } from '@/utils/game-save/fixtures'
import { parseSave, parseSaveBody } from '@/utils/game-save/save-parser'

// Every 1.2 world holds the same physical map objects however it was generated, so these counts
// are the cheapest proof that the header walk started in the right place and stayed aligned.
const MAP_CENSUS = {
  'BP_ResourceNode.': 459,
  'BP_FrackingSatellite.': 118,
  'BP_FrackingCore.': 17,
  'BP_ResourceNodeGeyser.': 31,
}

const FIXTURES: SaveFixture[] = [
  'vanilla',
  'vanilla-all-pure',
  'fossil-fuel-rich',
  'advanced-rich',
  'node-randomised',
]

describe('parseSave', () => {
  it.each(FIXTURES)('reads every object in the %s save', async name => {
    const { objects } = await parseSave(loadSaveFixture(name))

    expect(objects.length).toBeGreaterThan(800)
    for (const [fragment, expected] of Object.entries(MAP_CENSUS)) {
      expect(objects.filter(o => o.className.includes(fragment))).toHaveLength(expected)
    }
  })

  it.each(FIXTURES)('gives every object in %s a class, a path and a data block', async name => {
    const { objects } = await parseSave(loadSaveFixture(name))

    for (const object of objects) {
      expect(object.className.startsWith('/')).toBe(true)
      expect(object.levelName).toBe('Persistent_Level')
      expect(object.pathName).not.toBe('')
      expect(object.data).toBeInstanceOf(Uint8Array)
    }
  })

  it('anchors the header run on FGWorldSettings', async () => {
    const { objects } = await parseSave(loadSaveFixture('vanilla'))

    expect(objects[0].className).toBe('/Script/FactoryGame.FGWorldSettings')
  })

  it('records a component parent and leaves actors without one', async () => {
    const { objects } = await parseSave(loadSaveFixture('vanilla'))

    const component = objects.find(o => o.type === 0)
    const actor = objects.find(o => o.type === 1)

    expect(component?.parentActorName).toMatch(/^Persistent_Level/)
    expect(actor?.parentActorName).toBeUndefined()
  })

  it('rejects a file with no chunk header rather than parsing rubbish', async () => {
    await expect(inflateSaveBody(new Uint8Array(64))).rejects.toThrow(SaveFormatError)
  })

  it('refuses a body whose header and block counts disagree', async () => {
    // Truncating the body strands the header walk, which must fail loudly: a misaligned parse
    // reads one object's properties as another's, and every value after it would be wrong.
    const body = await inflateSaveBody(loadSaveFixture('vanilla'))

    expect(() => parseSaveBody(body.subarray(0, Math.floor(body.length / 2)))).toThrow(SaveFormatError)
  })
})
