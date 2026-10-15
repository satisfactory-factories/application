import { describe, expect, it } from 'vitest'
import { BinaryReader } from '@/utils/game-save/binary-reader'
import type { SaveBytes } from '@/utils/game-save/chunks'
import { SaveFormatError } from '@/utils/game-save/errors'

/**
 * Unreal's string encoding is the one place a hand-rolled reader can go quietly wrong, and the
 * UTF-16 branch is rare enough that no fixture is guaranteed to exercise it. These are built by
 * hand for that reason: the fixtures prove the format, this proves the primitives.
 */
const build = (write: (view: DataView, bytes: Uint8Array) => void, size: number): SaveBytes => {
  const bytes = new Uint8Array(size) as SaveBytes
  write(new DataView(bytes.buffer), bytes)
  return bytes
}

const utf8String = (text: string): SaveBytes => {
  const encoded = new TextEncoder().encode(`${text}\0`)
  return build((view, bytes) => {
    view.setInt32(0, encoded.length, true)
    bytes.set(encoded, 4)
  }, 4 + encoded.length)
}

const utf16String = (text: string): SaveBytes => {
  const units = [...`${text}\0`].map(c => c.charCodeAt(0))
  return build(view => {
    // A negative length counts UTF-16 code units rather than bytes.
    view.setInt32(0, -units.length, true)
    units.forEach((unit, i) => view.setUint16(4 + i * 2, unit, true))
  }, 4 + units.length * 2)
}

describe('BinaryReader', () => {
  it('reads a UTF-8 string and drops its trailing NUL', () => {
    const reader = new BinaryReader(utf8String('Persistent_Level'))

    expect(reader.readString()).toBe('Persistent_Level')
    expect(reader.remaining).toBe(0)
  })

  it('reads a UTF-16 string when the length is negative', () => {
    const reader = new BinaryReader(utf16String('Fabriken förråd'))

    expect(reader.readString()).toBe('Fabriken förråd')
    expect(reader.remaining).toBe(0)
  })

  it('reads an empty string without moving past its length', () => {
    const reader = new BinaryReader(build(view => view.setInt32(0, 0, true), 4))

    expect(reader.readString()).toBe('')
    expect(reader.offset).toBe(4)
  })

  it('narrows an int64 to a number', () => {
    const reader = new BinaryReader(build(view => view.setBigInt64(0, 142300236n, true), 8))

    expect(reader.readInt64()).toBe(142300236)
  })

  it('peeks without moving', () => {
    const reader = new BinaryReader(build(view => view.setInt32(0, 60, true), 4))

    expect(reader.peekInt32()).toBe(60)
    expect(reader.offset).toBe(0)
  })

  describe('a corrupt or truncated file', () => {
    // Every one of these would otherwise surface as a RangeError from inside a DataView, or as a
    // wild allocation. A user who drops half a file deserves to be told that is what happened.
    it('refuses an int32 that runs off the end', () => {
      expect(() => new BinaryReader(new Uint8Array(2) as SaveBytes).readInt32()).toThrow(SaveFormatError)
    })

    it('refuses an int64 that runs off the end', () => {
      expect(() => new BinaryReader(new Uint8Array(4) as SaveBytes).readInt64()).toThrow(SaveFormatError)
    })

    it('refuses a string whose declared length runs off the end', () => {
      const bytes = build(view => view.setInt32(0, 500, true), 8)

      expect(() => new BinaryReader(bytes).readString()).toThrow(SaveFormatError)
    })

    it('refuses an absurd string length outright rather than trying to allocate it', () => {
      const bytes = build(view => view.setInt32(0, 0x7FFFFFFF, true), 8)

      expect(() => new BinaryReader(bytes).readString()).toThrow(/declares a \d+-byte string/)
    })

    it('refuses a data block that runs off the end', () => {
      expect(() => new BinaryReader(new Uint8Array(4) as SaveBytes).readBytes(64)).toThrow(SaveFormatError)
    })
  })
})
