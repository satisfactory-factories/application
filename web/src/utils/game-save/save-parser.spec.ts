import { describe, expect, it } from 'vitest'
import { inflateSaveBody, SaveFormatError } from '@/utils/game-save/chunks'
import type { SaveBytes } from '@/utils/game-save/chunks'
import { SAVE_PROBLEM_REASONS, saveProblemOf } from '@/utils/game-save/errors'
import { loadSaveFixture, SaveFixture } from '@/utils/game-save/fixtures'
import { parseSave, parseSaveBody, readSessionName } from '@/utils/game-save/save-parser'

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

describe('readSessionName', () => {
  it.each([
    ['vanilla', 'Vanilla'],
    ['node-randomised', 'Test 1.2'],
    ['vanilla-all-pure', 'Base nodes all pure'],
  ] as const)('reads the session name from the %s header', (name, expected) => {
    expect(readSessionName(loadSaveFixture(name))).toBe(expected)
  })

  it('gives up quietly on bytes that are not a save', () => {
    expect(readSessionName(new Uint8Array(8))).toBe('')
  })
})

describe('what a player is told about a file that is not a save', () => {
  it('says plainly when the file is not a save at all', async () => {
    await expect(parseSave(new TextEncoder().encode('not a save') as SaveBytes))
      .rejects.toMatchObject({ problem: 'notASave' })
  })

  it('calls a save it cannot find its way into unsupported', () => {
    expect(() => parseSaveBody(new Uint8Array(64) as SaveBytes)).toThrow(expect.objectContaining({ problem: 'unsupported' }))
  })

  it('maps every problem to a reason a player can read', () => {
    expect(saveProblemOf(new SaveFormatError('x', 'noRecipes'))).toBe('noRecipes')
    expect(saveProblemOf(new TypeError('corrupt deflate stream'))).toBe('damaged')
    expect(Object.values(SAVE_PROBLEM_REASONS).every(reason => reason.endsWith('.'))).toBe(true)
  })
})

// A played world lists the objects it has destroyed (drop pods opened, collectables picked up)
// between the headers and the objects. Every fixture is a fresh world with none, so this one is
// built by hand: skipping a fixed width there refused every played save.
describe('parseSaveBody, for a played world', () => {
  const encoder = new TextEncoder()
  const parts: number[] = []
  const int32 = (value: number) => {
    const view = new DataView(new ArrayBuffer(4))
    view.setInt32(0, value, true)
    parts.push(...new Uint8Array(view.buffer))
  }
  const string = (text: string) => {
    const encoded = encoder.encode(`${text}\0`)
    int32(encoded.length)
    parts.push(...encoded)
  }

  // One actor header: the anchor every save starts its header run with.
  int32(1)
  string('/Script/FactoryGame.FGWorldSettings')
  string('Persistent_Level')
  string('Persistent_Level:PersistentLevel.FGWorldSettings')
  parts.push(...new Uint8Array(52))
  // One level, with two destroyed objects.
  int32(1)
  string('Persistent_Level')
  int32(2)
  for (const pod of ['BP_DropPod1_2', 'BP_DropPod4_4']) {
    string('Persistent_Level')
    string(`Persistent_Level:PersistentLevel.${pod}`)
  }
  parts.push(...new Uint8Array(8)) // data section length
  int32(1)
  // One object block: version, 0, length, 0, then the data.
  int32(60)
  int32(0)
  int32(4)
  int32(0)
  parts.push(1, 2, 3, 4)

  it('reads past the destroyed objects to the data blocks', () => {
    const { objects } = parseSaveBody(Uint8Array.from(parts) as SaveBytes)

    expect(objects).toHaveLength(1)
    expect(objects[0].className).toBe('/Script/FactoryGame.FGWorldSettings')
    expect([...objects[0].data]).toEqual([1, 2, 3, 4])
  })
})
