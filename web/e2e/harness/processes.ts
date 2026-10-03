import { type ChildProcess, spawn } from 'node:child_process'
import net from 'node:net'

export interface RunOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
}

/** Runs a command to completion, and fails with whatever it printed. */
export const runToCompletion = (
  command: string,
  args: string[],
  options: RunOptions,
): Promise<void> => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', chunk => { output += String(chunk) })
  child.stderr.on('data', chunk => { output += String(chunk) })

  child.on('error', reject)
  child.on('exit', code => {
    if (code === 0) resolve()
    else reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${output.slice(-4000)}`))
  })
})

export interface LongRunning {
  child: ChildProcess
  /** Everything the process has printed, for the failure message if it dies. */
  output: () => string
  stop: () => Promise<void>
}

/**
 * A server we have to shut down again. Spawned as `node <entrypoint>` rather than
 * through a `.bin` shim so there is one PID to signal, with no shell in between
 * to be killed while the real process keeps the port.
 */
export const startLongRunning = (
  args: string[],
  options: RunOptions & { name: string },
): LongRunning => {
  const child = spawn(process.execPath, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  const record = (chunk: unknown) => {
    output += String(chunk)
    if (process.env.E2E_VERBOSE === '1') process.stdout.write(`[${options.name}] ${String(chunk)}`)
  }
  child.stdout.on('data', record)
  child.stderr.on('data', record)

  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>(resolve => {
      // SIGKILL after a grace period: the API closes sockets on SIGTERM, and a
      // hung shutdown must not leave the port held for the next run.
      const kill = setTimeout(() => child.kill('SIGKILL'), 5_000)
      child.once('exit', () => {
        clearTimeout(kill)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }

  return { child, output: () => output, stop }
}

export interface WaitOptions {
  timeoutMs?: number
  /** Whatever the process has printed, so a failure says why rather than "timed out". */
  describe: () => string
  /** True to insist on a 2xx: /health answers 503 until Mongo is actually reachable. */
  requireOk?: boolean
}

export const waitForHttp = async (
  url: string,
  { timeoutMs = 60_000, describe, requireOk = false }: WaitOptions,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  let last = 'no attempt made'

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      if (!requireOk || response.ok) return
      last = `answered ${response.status}`
    } catch (cause) {
      last = cause instanceof Error ? cause.message : String(cause)
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }

  throw new Error(`${url} did not come up within ${timeoutMs}ms (${last})\n${describe()}`)
}

export const portIsFree = (port: number): Promise<boolean> => new Promise(resolve => {
  const socket = net.connect({ port, host: '127.0.0.1' })
  const settle = (free: boolean) => {
    socket.destroy()
    resolve(free)
  }
  socket.setTimeout(1_000)
  socket.once('connect', () => settle(false))
  socket.once('timeout', () => settle(true))
  socket.once('error', () => settle(true))
})
