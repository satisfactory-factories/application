import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { MongoMemoryServer } from 'mongodb-memory-server'

import {
  API_PORT,
  BACKEND_ROOT,
  REPO_ROOT,
  skipBuild,
  WEB_PORT,
  WEB_ROOT,
} from './config'
import {
  type LongRunning,
  portIsFree,
  runToCompletion,
  startLongRunning,
  waitForHttp,
} from './harness/processes'

const require_ = createRequire(path.join(WEB_ROOT, 'package.json'))

/** Vite's `exports` map hides its bin, so the package directory is the way in. */
const viteBin = (): string =>
  path.join(path.dirname(require_.resolve('vite/package.json')), 'bin', 'vite.js')

const PORT_HELP = 'The harness cannot pick another one: the API only accepts ' +
  'http://localhost:3000 as an origin, and a dev build only ever calls port 3001.'

const assertPortsFree = async (): Promise<void> => {
  for (const [port, what] of [[WEB_PORT, 'web app'], [API_PORT, 'API']] as const) {
    if (await portIsFree(port)) continue
    throw new Error(`Port ${port} is already in use, and the e2e ${what} needs it. ${PORT_HELP}`)
  }
}

/**
 * The client is served as a production build rather than from the dev server: it
 * is five seconds to build, and it removes HMR, the dev websocket and mid-run
 * dependency re-optimisation — three things that reload the page underneath a
 * test. `VITE_ENV=dev` is what points the bundle at the local API.
 */
const build = async (): Promise<void> => {
  if (skipBuild()) return
  await runToCompletion('pnpm', ['--filter', 'backend', 'run', 'build'], { cwd: REPO_ROOT })
  await runToCompletion('pnpm', ['exec', 'vite', 'build'], {
    cwd: WEB_ROOT,
    env: { VITE_ENV: 'dev' },
  })
}

export default async function globalSetup (): Promise<() => Promise<void>> {
  await assertPortsFree()
  await build()

  const mongo = await MongoMemoryServer.create()
  const started: LongRunning[] = []

  const stopAll = async () => {
    for (const server of [...started].reverse()) await server.stop()
    await mongo.stop()
  }

  try {
    // A directory of its own, so @nestjs/config cannot find backend/.env and
    // quietly prefer its MONGODB_URI over the one handed in here.
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-e2e-'))

    const api = startLongRunning([path.join(BACKEND_ROOT, 'dist', 'main.js')], {
      name: 'api',
      cwd: runDir,
      env: {
        JWT_SECRET: randomBytes(32).toString('hex'),
        MONGODB_URI: `${mongo.getUri()}sf-e2e`,
        PORT: String(API_PORT),
      },
    })
    started.push(api)
    // 200 rather than "answered at all": the Mongo connection is lazy, and /health
    // reports 503 until it is up.
    await waitForHttp(`http://127.0.0.1:${API_PORT}/health`, {
      describe: api.output,
      requireOk: true,
    })

    const web = startLongRunning(
      [viteBin(), 'preview',
        '--port', String(WEB_PORT), '--strictPort', '--host', '127.0.0.1'],
      { name: 'web', cwd: WEB_ROOT },
    )
    started.push(web)
    await waitForHttp(`http://127.0.0.1:${WEB_PORT}/`, { describe: web.output })

    return async () => {
      await stopAll()
      await fs.rm(runDir, { recursive: true, force: true })
    }
  } catch (cause) {
    await stopAll()
    throw cause
  }
}
