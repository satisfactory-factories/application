// The version this API was built from, published by GET /version so a planner tab can notice a
// release without waiting to be refused a save. Issue #166.
//
// Kept away from Express so it can be unit tested — see app-version.spec.ts.

import fs from 'fs';
import path from 'path';

// Reported when the version cannot be established. A real version is never this, and the
// planner's comparison rejects it, so an unreadable file degrades to "no update" rather than to
// a false one.
export const UNKNOWN_VERSION = 'unknown';

// The repo root package.json, which is where every package's version comes from. Resolved from
// the working directory rather than __dirname because the compiled output nests one level deeper
// than the source, so a path relative to the module would differ between `pnpm dev` and the
// image. Both start the process in backend/.
const rootPackagePath = (): string => path.resolve(process.cwd(), '..', 'package.json');

let cached: string | null = null;

// Deliberately lazy rather than evaluated at import: backend.ts calls dotenv.config() *after*
// its imports, so a module-scope read would miss an APP_VERSION set in the backend's .env.
export const appVersion = (): string => {
  if (cached !== null) return cached;

  const configured = process.env.APP_VERSION?.trim();
  if (configured) {
    cached = configured;
    return cached;
  }

  try {
    const contents = fs.readFileSync(rootPackagePath(), 'utf8');
    const version = JSON.parse(contents)?.version;
    if (typeof version === 'string' && version.trim() !== '') {
      cached = version.trim();
      return cached;
    }
    console.warn(`app-version: ${rootPackagePath()} has no usable version field.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`app-version: could not read ${rootPackagePath()}: ${message}`);
  }

  // Loud, because the symptom otherwise is a feature that silently never fires.
  console.warn(`app-version: reporting "${UNKNOWN_VERSION}"; nothing will be told about releases. Set APP_VERSION to fix this.`);
  cached = UNKNOWN_VERSION;
  return cached;
};

// Tests only. The cache exists so the file is read once per process.
export const resetAppVersionCache = (): void => {
  cached = null;
};
