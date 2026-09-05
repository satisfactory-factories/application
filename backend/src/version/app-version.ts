import fs from 'node:fs'
import path from 'node:path'

/**
 * The version this API was built from, published by GET /version so a planner tab can notice a
 * release without waiting to be refused a save. Issue #166.
 */

/**
 * Reported when the version cannot be established. A real version is never this, and the
 * planner's comparison rejects it, so an unreadable manifest degrades to "no update" rather
 * than to a false one.
 */
export const UNKNOWN_VERSION = 'unknown'

const readVersion = (manifestPath: string): string | null => {
  try {
    const version = (JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { version?: unknown })
      .version
    return typeof version === 'string' && version.trim() !== '' ? version.trim() : null
  } catch {
    return null
  }
}

// Only the repo root manifest carries a version; every package takes its own from there. So the
// first `version` found walking upwards is the right one, wherever the process was started —
// `/app/backend` in the image, `backend/` under `pnpm dev` and vitest, the repo root if someone
// runs `node backend/dist/main.js` from it. __dirname covers a dist started from somewhere else
// again, and is guarded because an ESM transform leaves it undefined.
const startDirectories = (): string[] =>
  typeof __dirname === 'undefined' ? [process.cwd()] : [process.cwd(), __dirname]

const findVersion = (): string | null => {
  for (const start of startDirectories()) {
    let directory = path.resolve(start)
    for (;;) {
      const found = readVersion(path.join(directory, 'package.json'))
      if (found) return found

      const parent = path.dirname(directory)
      if (parent === directory) break
      directory = parent
    }
  }
  return null
}

let cached: string | null = null

/** Lazy rather than read at import, so an APP_VERSION set by the environment still wins. */
export const appVersion = (): string => {
  if (cached !== null) return cached

  cached = process.env.APP_VERSION?.trim() || findVersion() || UNKNOWN_VERSION
  if (cached === UNKNOWN_VERSION) {
    // Loud, because the symptom otherwise is a feature that silently never fires.
    console.warn(`app-version: reporting "${UNKNOWN_VERSION}"; nothing will be told about releases. Set APP_VERSION to fix this.`)
  }
  return cached
}

/** Tests only. The cache exists so the manifest is read once per process. */
export const resetAppVersionCache = (): void => {
  cached = null
}
