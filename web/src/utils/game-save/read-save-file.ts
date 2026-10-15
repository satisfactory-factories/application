import { readWorldFromSave, SAVE_PROBLEM_REASONS, saveProblemOf } from '@/utils/game-save/index'
import type { ExtractOptions, ReadWorldRequest, ReadWorldResponse, SaveBytes, SaveProblem } from '@/utils/game-save/index'
import type { WorldSnapshot } from '@/utils/game-save/world-snapshot'

/** A save the planner could not read, carrying the reason to show the player. */
export class IncompatibleSaveError extends Error {
  constructor (readonly problem: SaveProblem, detail: string) {
    super(detail)
    this.name = 'IncompatibleSaveError'
  }

  get reason (): string {
    return SAVE_PROBLEM_REASONS[this.problem]
  }
}

/**
 * Reads a .sav the player picked, on a worker so the page stays responsive while a large save
 * inflates. Falls back to this thread where workers are unavailable.
 */
export const readSaveFile = async (file: File, buildingIds: readonly string[]): Promise<WorldSnapshot> => {
  const bytes: SaveBytes = new Uint8Array(await file.arrayBuffer())
  // A plain array: a reactive proxy cannot be posted to a worker.
  const options: ExtractOptions = { unlocksOnly: true, buildingIds: [...buildingIds] }

  if (typeof Worker === 'undefined') {
    try {
      return await readWorldFromSave(bytes, options)
    } catch (error) {
      throw new IncompatibleSaveError(saveProblemOf(error), error instanceof Error ? error.message : String(error))
    }
  }

  const worker = new Worker(new URL('./game-save.worker.ts', import.meta.url), { type: 'module' })
  try {
    const response = await new Promise<ReadWorldResponse>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<ReadWorldResponse>) => resolve(event.data)
      worker.onerror = event => reject(new Error(event.message || 'The save reader stopped unexpectedly.'))
      // Transferred rather than copied: the planner has no further use for the bytes.
      worker.postMessage({ bytes, options } satisfies ReadWorldRequest, [bytes.buffer])
    })
    if (!response.ok) throw new IncompatibleSaveError(response.problem, response.error)
    return response.snapshot
  } finally {
    worker.terminate()
  }
}
