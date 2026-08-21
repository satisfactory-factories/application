/**
 * Object headers and their data blocks, zipped.
 *
 * The headers are one unbroken run starting at the FGWorldSettings actor; the data section that
 * follows holds one block per object in exactly the same order. Zipping them by index is how an
 * object's properties are matched to its class, and a header walk that started in the wrong
 * place shows up as the two counts disagreeing rather than as garbled data.
 */

import { BinaryReader } from '@/utils/game-save/binary-reader'
import { inflateSaveBody } from '@/utils/game-save/chunks'
import type { SaveBytes } from '@/utils/game-save/chunks'
import { SaveFormatError } from '@/utils/game-save/errors'

// The first actor written to every save, and so the anchor for the header run. Its int32 type
// field sits 8 bytes before the class name: 4 for the type, 4 for the name's length prefix.
const ANCHOR_CLASS = '/Script/FactoryGame.FGWorldSettings'
const ANCHOR_BACKTRACK = 8

const ACTOR = 1
const COMPONENT = 0

// 8 bytes of flags, then a 40-byte transform (quaternion, translation, scale) plus 4 trailing.
const ACTOR_TRAILER_BYTES = 52

export interface SaveObject {
  type: typeof ACTOR | typeof COMPONENT
  className: string
  levelName: string
  pathName: string
  parentActorName?: string
  // The object's tagged-property bytes. Read with the helpers in properties.ts.
  data: SaveBytes
}

export interface ParsedSave {
  objects: SaveObject[]
}

const matchesAt = (body: SaveBytes, needle: Uint8Array, at: number): boolean => {
  for (let i = 0; i < needle.length; i++) {
    if (body[at + i] !== needle[i]) return false
  }
  return true
}

const findAnchor = (body: SaveBytes): number => {
  const needle = new TextEncoder().encode(`${ANCHOR_CLASS}\0`)
  for (let i = 0; i + needle.length <= body.byteLength; i++) {
    if (matchesAt(body, needle, i)) return i
  }
  return -1
}

const readHeaders = (reader: BinaryReader): Omit<SaveObject, 'data'>[] => {
  const headers: Omit<SaveObject, 'data'>[] = []

  while (reader.remaining > 8) {
    const mark = reader.offset
    const type = reader.readInt32()
    if (type !== ACTOR && type !== COMPONENT) {
      reader.offset = mark
      break
    }

    const className = reader.readString()
    // Every class is a package path. Anything else means the run has ended and we are reading
    // the data section's own fields as if they were a header.
    if (!className.startsWith('/')) {
      reader.offset = mark
      break
    }

    const levelName = reader.readString()
    const pathName = reader.readString()

    let parentActorName: string | undefined
    if (type === ACTOR) {
      reader.skip(ACTOR_TRAILER_BYTES)
    } else {
      reader.skip(4)
      parentActorName = reader.readString()
    }

    headers.push({ type, className, levelName, pathName, parentActorName })
  }

  return headers
}

/** Parse an already-inflated save body. Split out so specs can drive it without decompressing. */
export const parseSaveBody = (body: SaveBytes): ParsedSave => {
  const anchor = findAnchor(body)
  if (anchor < 0) throw new SaveFormatError(`Could not find ${ANCHOR_CLASS}: unsupported save version.`)

  const reader = new BinaryReader(body, anchor - ANCHOR_BACKTRACK)
  const headers = readHeaders(reader)
  if (!headers.length) throw new SaveFormatError('No object headers could be read.')

  reader.skip(4) // marker, always 1
  reader.readString() // level name
  reader.skip(4) // unknown
  reader.skip(8) // total byte length of the data section
  const count = reader.readInt32()

  if (count !== headers.length) {
    throw new SaveFormatError(`Save is misaligned: ${headers.length} object headers but ${count} data blocks.`)
  }

  const objects: SaveObject[] = []
  for (let i = 0; i < count; i++) {
    reader.skip(4) // save version, 60 on 1.2
    reader.skip(4) // always 0
    const length = reader.readInt32()
    reader.skip(4) // always 0
    objects.push({ ...headers[i], data: reader.readBytes(length) })
  }

  return { objects }
}

export const parseSave = async (bytes: SaveBytes): Promise<ParsedSave> =>
  parseSaveBody(await inflateSaveBody(bytes))
