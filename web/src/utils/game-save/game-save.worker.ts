/**
 * The worker that reads a save. Kept to a thin shell so everything worth testing lives in
 * index.ts and runs on the main thread under Vitest, where there is no Worker.
 */

import { handleReadWorld } from '@/utils/game-save/index'
import type { ReadWorldRequest } from '@/utils/game-save/index'

self.onmessage = async (event: MessageEvent<ReadWorldRequest>) => {
  self.postMessage(await handleReadWorld(event.data))
}
