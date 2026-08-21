/**
 * Reading a world out of a .sav file.
 *
 * A 10 MB save inflates to roughly 180 MB and takes seconds to walk, so this is designed to be
 * called on a worker: the entry point takes bytes and returns a plain object, with no store, DOM
 * or event-bus access anywhere beneath it. readWorldFromSave() is the same work on the calling
 * thread, which is what the specs use and what a caller without worker support falls back to.
 */

import { extractWorld } from '@/utils/game-save/extract-world'
import type { ExtractOptions } from '@/utils/game-save/extract-world'
import { parseSave } from '@/utils/game-save/save-parser'
import type { SaveBytes } from '@/utils/game-save/chunks'
import type { WorldSnapshot } from '@/utils/game-save/world-snapshot'

export type { ExtractOptions } from '@/utils/game-save/extract-world'
export { SaveFormatError } from '@/utils/game-save/chunks'
export type { SaveBytes } from '@/utils/game-save/chunks'
export * from '@/utils/game-save/world-snapshot'

export interface ReadWorldRequest {
  bytes: SaveBytes
  options?: ExtractOptions
}

export type ReadWorldResponse =
  | { ok: true, snapshot: WorldSnapshot } |
  { ok: false, error: string }

export const readWorldFromSave = async (
  bytes: SaveBytes,
  options: ExtractOptions = {},
): Promise<WorldSnapshot> => extractWorld(await parseSave(bytes), options)

/**
 * The worker's message handler, exported so it can be tested without spawning one.
 * Errors are returned rather than thrown: a rejected worker message loses the reason.
 */
export const handleReadWorld = async (request: ReadWorldRequest): Promise<ReadWorldResponse> => {
  try {
    return { ok: true, snapshot: await readWorldFromSave(request.bytes, request.options) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
