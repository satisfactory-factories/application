import path from 'node:path'

/**
 * Neither port is free to move. The API's CORS allowlist and the WS upgrade's
 * Origin check (`backend/src/config/cors.ts`, `WEB_ORIGINS`) accept exactly
 * `http://localhost:3000` for local work, and a client built with `VITE_ENV=dev`
 * bakes `http://localhost:3001` in as its `apiUrl`.
 */
export const WEB_PORT = 3000
export const API_PORT = 3001

export const WEB_URL = `http://localhost:${WEB_PORT}`
export const API_URL = `http://localhost:${API_PORT}`

export const E2E_ROOT = __dirname
export const WEB_ROOT = path.resolve(__dirname, '..')
export const REPO_ROOT = path.resolve(__dirname, '../..')
export const BACKEND_ROOT = path.join(REPO_ROOT, 'backend')

/** Set to skip the two builds while iterating on the tests themselves. */
export const skipBuild = (): boolean => process.env.E2E_SKIP_BUILD === '1'
