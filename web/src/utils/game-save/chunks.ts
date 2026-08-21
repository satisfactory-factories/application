/**
 * A .sav file is an uncompressed header followed by a run of zlib chunks. Each chunk sits behind
 * a 49-byte header: the magic, a chunk-size field, an algorithm byte, then the compressed and
 * uncompressed sizes twice over. Inflating them and concatenating gives the body every other
 * module in this folder reads.
 */

import { SaveFormatError } from '@/utils/game-save/errors'

/**
 * Bytes backed by a real ArrayBuffer rather than the generic ArrayBufferLike. DecompressionStream
 * and DataView both refuse the loose form, and pinning it here beats casting at each call.
 */
export type SaveBytes = Uint8Array<ArrayBuffer>

export { SaveFormatError } from '@/utils/game-save/errors'

// 0x9E2A83C1 little-endian.
export const CHUNK_MAGIC = Uint8Array.from([0xC1, 0x83, 0x2A, 0x9E])

const CHUNK_HEADER_BYTES = 49
const COMPRESSED_SIZE_OFFSET = 17

const matchesMagic = (bytes: SaveBytes, at: number): boolean =>
  bytes[at] === CHUNK_MAGIC[0] &&
  bytes[at + 1] === CHUNK_MAGIC[1] &&
  bytes[at + 2] === CHUNK_MAGIC[2] &&
  bytes[at + 3] === CHUNK_MAGIC[3]

export const findFirstChunk = (bytes: SaveBytes): number => {
  for (let i = 0; i + 4 <= bytes.byteLength; i++) {
    if (matchesMagic(bytes, i)) return i
  }
  return -1
}

// Fed from a ReadableStream rather than a Blob: jsdom's Blob has no stream(), so the specs
// could not decompress anything through one.
const inflate = async (chunk: SaveBytes): Promise<SaveBytes> => {
  const source = new ReadableStream<SaveBytes>({
    start (controller) {
      controller.enqueue(chunk)
      controller.close()
    },
  })

  const reader = source.pipeThrough(new DecompressionStream('deflate')).getReader()
  const parts: SaveBytes[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    total += value.byteLength
  }

  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}

/**
 * Inflate every chunk and return one contiguous body.
 *
 * A 10 MB save inflates to roughly 180 MB, so this is the one genuinely heavy step and the
 * reason the whole read belongs on a worker.
 */
export const inflateSaveBody = async (bytes: SaveBytes): Promise<SaveBytes> => {
  const start = findFirstChunk(bytes)
  if (start < 0) throw new SaveFormatError('No zlib chunk header found: this is not a Satisfactory save.')

  const parts: SaveBytes[] = []
  let total = 0
  let offset = start

  while (offset + CHUNK_HEADER_BYTES <= bytes.byteLength && matchesMagic(bytes, offset)) {
    const header = new DataView(bytes.buffer, bytes.byteOffset + offset, CHUNK_HEADER_BYTES)
    const compressed = Number(header.getBigInt64(COMPRESSED_SIZE_OFFSET, true))
    if (compressed <= 0) throw new SaveFormatError(`Chunk at ${offset} declares a ${compressed}-byte payload.`)

    const body = offset + CHUNK_HEADER_BYTES
    const part = await inflate(bytes.subarray(body, body + compressed))
    parts.push(part)
    total += part.byteLength
    offset = body + compressed
  }

  if (!parts.length) throw new SaveFormatError('Save contains no readable chunks.')

  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}
