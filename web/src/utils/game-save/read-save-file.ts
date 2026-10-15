import { readWorldFromSave } from '@/utils/game-save/index'
import type { ExtractOptions, ReadWorldRequest, ReadWorldResponse, SaveBytes } from '@/utils/game-save/index'
import type { WorldSnapshot } from '@/utils/game-save/world-snapshot'

/**
 * Reads a .sav the player picked, on a worker so the page stays responsive while a large save
 * inflates. Falls back to this thread where workers are unavailable.
 */
export const readSaveFile = async (file: File, options: ExtractOptions = {}): Promise<WorldSnapshot> => {
  const bytes: SaveBytes = new Uint8Array(await file.arrayBuffer())

  if (typeof Worker === 'undefined') return readWorldFromSave(bytes, options)

  const worker = new Worker(new URL('./game-save.worker.ts', import.meta.url), { type: 'module' })
  try {
    const response = await new Promise<ReadWorldResponse>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<ReadWorldResponse>) => resolve(event.data)
      worker.onerror = event => reject(new Error(event.message || 'The save reader stopped unexpectedly.'))
      // Transferred rather than copied: the planner has no further use for the bytes.
      worker.postMessage({ bytes, options } satisfies ReadWorldRequest, [bytes.buffer])
    })
    if (!response.ok) throw new Error(response.error)
    return response.snapshot
  } finally {
    worker.terminate()
  }
}
