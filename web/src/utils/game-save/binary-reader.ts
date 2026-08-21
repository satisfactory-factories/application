/**
 * A cursor over the inflated body of a .sav file.
 *
 * Unreal writes little-endian, and its strings are length-prefixed rather than NUL-terminated:
 * a positive length counts UTF-8 bytes including a trailing NUL, a negative one counts UTF-16LE
 * code units including a trailing NUL. Everything else in the format is int32 or int64.
 */

import type { SaveBytes } from '@/utils/game-save/chunks'
import { SaveFormatError } from '@/utils/game-save/errors'

const utf8 = new TextDecoder('utf-8')
const utf16 = new TextDecoder('utf-16le')

// Strings are length-prefixed, so a truncated or corrupt file reads a nonsense length and asks
// for a wild allocation. Every read is bounds-checked to turn that into an error a caller can
// show, rather than a RangeError from deep inside a DataView.
const MAX_STRING_BYTES = 1 << 20

export class BinaryReader {
  readonly bytes: SaveBytes
  private readonly view: DataView
  offset = 0

  constructor (bytes: SaveBytes, offset = 0) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.offset = offset
  }

  get remaining (): number {
    return this.bytes.byteLength - this.offset
  }

  private require (count: number, what: string): void {
    if (count < 0 || this.offset + count > this.bytes.byteLength) {
      throw new SaveFormatError(`Save ends mid-${what}: wanted ${count} bytes at ${this.offset}.`)
    }
  }

  peekInt32 (at = this.offset): number {
    return this.view.getInt32(at, true)
  }

  readInt32 (): number {
    this.require(4, 'int32')
    const value = this.view.getInt32(this.offset, true)
    this.offset += 4
    return value
  }

  // Sizes in a save comfortably fit a double, so the BigInt is narrowed here rather than
  // leaking into arithmetic at every call site.
  readInt64 (): number {
    this.require(8, 'int64')
    const value = this.view.getBigInt64(this.offset, true)
    this.offset += 8
    return Number(value)
  }

  readString (): string {
    const length = this.readInt32()
    if (length === 0) return ''

    const byteCount = length > 0 ? length : -length * 2
    if (byteCount > MAX_STRING_BYTES) {
      throw new SaveFormatError(`Save declares a ${byteCount}-byte string at ${this.offset}.`)
    }
    this.require(byteCount, 'string')

    if (length > 0) {
      const start = this.offset
      this.offset += length
      return utf8.decode(this.bytes.subarray(start, start + length - 1))
    }

    const start = this.offset
    this.offset += byteCount
    return utf16.decode(this.bytes.subarray(start, start + byteCount - 2))
  }

  skip (count: number): void {
    this.offset += count
  }

  readBytes (count: number): SaveBytes {
    this.require(count, 'block')
    const start = this.offset
    this.offset += count
    return this.bytes.subarray(start, start + count)
  }
}
