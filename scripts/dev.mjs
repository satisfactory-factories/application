#!/usr/bin/env node
// Launches the dev servers, optionally somewhere other than 3000/3001.
//
// Local dev only. Every deployed port is still fixed and load-bearing — see the
// Ports section of the README before touching anything outside this file.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULT_WEB_PORT = 3000
const DEFAULT_API_PORT = 3001

const USAGE = `Usage: pnpm dev [--port <web>[,<api>]]

  pnpm dev                       web on ${DEFAULT_WEB_PORT}, API on ${DEFAULT_API_PORT}
  pnpm dev --port 3100,3101      web on 3100, API on 3101
  pnpm dev --port 3100           web on 3100, API left on ${DEFAULT_API_PORT}

WEB_PORT and API_PORT (or PORT, the API's existing name) do the same thing as
environment variables; the flag wins over both.`

const fail = message => {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(1)
}

const parsePort = (value, label) => {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`"${value}" is not a usable ${label} port.`)
  }
  return port
}

/**
 * `--port 3100,3101` is web,API; a lone number moves only the web app.
 *
 * PORT is read only when this run actually starts the API, because it keeps
 * `PORT=3011 pnpm dev:backend` working as documented, and because the puppeteer
 * harnesses under web/testing/browser use the same name for the *web* port.
 */
const resolvePorts = (argv, env, { servesApi }) => {
  const apiFromEnv = env.API_PORT || (servesApi ? env.PORT : undefined)
  const fromEnv = {
    web: env.WEB_PORT ? parsePort(env.WEB_PORT, 'web') : DEFAULT_WEB_PORT,
    api: apiFromEnv ? parsePort(apiFromEnv, 'API') : DEFAULT_API_PORT,
  }

  const flag = argv.indexOf('--port')
  if (flag === -1) return fromEnv

  const raw = argv[flag + 1]
  if (!raw || raw.startsWith('-')) fail('--port needs a value.')

  const [web, api] = raw.split(',')
  return {
    web: parsePort(web, 'web'),
    api: api === undefined ? fromEnv.api : parsePort(api, 'API'),
  }
}

/**
 * Moving a port is three changes, not one. The web app has to be told where the
 * API went — VITE_API_URL is the one lever that beats every default in
 * web/src/config/config.ts, and the sync socket URL is derived from it. The API
 * has to be told the web app moved, or every request fails preflight and every
 * WS upgrade 403s against WEB_ORIGINS in backend/src/config/cors.ts.
 *
 * Both are left alone on the default ports, so an unflagged run hands the child
 * processes exactly the environment they got before this script existed.
 */
const devEnv = (ports, env, { servesApi }) => {
  const next = { ...env, WEB_PORT: String(ports.web), API_PORT: String(ports.api) }
  if (servesApi) next.PORT = String(ports.api)

  if (ports.api !== DEFAULT_API_PORT && !env.VITE_API_URL) {
    next.VITE_API_URL = `http://localhost:${ports.api}`
  }
  // Appended rather than assigned: a value already in the environment is
  // somebody's preview origin and outlives this run.
  if (ports.web !== DEFAULT_WEB_PORT) {
    next.CORS_EXTRA_ORIGINS = [env.CORS_EXTRA_ORIGINS, `http://localhost:${ports.web}`]
      .filter(Boolean)
      .join(',')
  }
  return next
}

const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn('pnpm', args, { cwd: REPO_ROOT, env, stdio: 'inherit' })
  child.on('error', reject)
  child.on('exit', code => resolve(code ?? 1))
})

const TARGETS = {
  web: {
    steps: [['--filter', 'web', 'run', 'dev']],
    servesWeb: true,
    servesApi: false,
  },
  backend: {
    steps: [['db:up'], ['--filter', 'backend', 'run', 'dev']],
    servesWeb: false,
    servesApi: true,
  },
  all: {
    steps: [['db:up'], ['--parallel', '--filter', 'web', '--filter', 'backend', 'run', 'dev']],
    servesWeb: true,
    servesApi: true,
  },
}

const main = async () => {
  const argv = process.argv.slice(2)
  const target = TARGETS[argv[0]]
  if (!target) fail(`Unknown target "${argv[0] ?? ''}".`)

  const ports = resolvePorts(argv, process.env, target)
  if (target.servesWeb && target.servesApi && ports.web === ports.api) {
    fail(`The web app and the API cannot share port ${ports.web}.`)
  }

  const env = devEnv(ports, process.env, target)

  if (target.servesWeb) console.log(`Web app: http://localhost:${ports.web}`)
  if (target.servesApi) console.log(`API:     http://localhost:${ports.api}`)
  // dev:web against an API somewhere else is a legitimate combination, so say so.
  if (target.servesWeb && !target.servesApi && env.VITE_API_URL) {
    console.log(`API:     ${env.VITE_API_URL} (not started here)`)
  }

  for (const step of target.steps) {
    const code = await run(step, env)
    if (code !== 0) process.exit(code)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
