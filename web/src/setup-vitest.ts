import { afterAll, vi } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { config } from '@/config/config'
import { createPinia, setActivePinia } from 'pinia'

// Mock window.alert for JSDOM environment
Object.defineProperty(window, 'alert', {
  value: vi.fn(),
  writable: true,
})

// Node 24+ defines a built-in global `localStorage`/`sessionStorage` that is
// `undefined` unless `--localstorage-file` is passed, and it shadows jsdom's
// implementation. Browser code here uses the bare `localStorage` global, so we
// install a simple in-memory Storage on both `globalThis` and `window` to keep
// the two in sync and independent of the Node/jsdom quirk.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length (): number {
    return this.store.size
  }

  clear (): void {
    this.store.clear()
  }

  getItem (key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key (index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  removeItem (key: string): void {
    this.store.delete(key)
  }

  setItem (key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, name, { value: storage, writable: true, configurable: true })
  Object.defineProperty(window, name, { value: storage, writable: true, configurable: true })
}

// jsdom has no visualViewport, and Vuetify's overlay (every v-dialog, v-menu, v-tooltip)
// reads the bare global while positioning itself — an unhandled ReferenceError otherwise.
if (typeof globalThis.visualViewport === 'undefined') {
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, 'visualViewport', { value: viewport, writable: true, configurable: true })
  }
}

// jsdom has no ResizeObserver, and Vuetify's VSlideGroup constructs one unconditionally —
// so every v-tabs / v-slide-group / v-chip-group throws on mount without this. jsdom does no
// layout, so a no-op that never fires is the honest stand-in.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class NoopResizeObserver implements ResizeObserver {
    observe (): void {}
    unobserve (): void {}
    disconnect (): void {}
  }
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, 'ResizeObserver', { value: NoopResizeObserver, writable: true, configurable: true })
  }
}

// jsdom's WebSocket is a thin wrapper around undici's, and undici builds its `open` event
// with the realm's `Event` — jsdom's — then dispatches it through Node's own `EventTarget`,
// whose `instanceof Event` check is against Node's class. Hence the nonsense error, `The
// "event" argument must be an instance of Event. Received an instance of Event`. Nothing
// awaits it, so it escapes as an uncaught exception that Vitest counts and exits 1 on, on a
// run where every test passed. It fires only once a socket actually connects, which is what
// made it intermittent.
//
// No unit test should be opening a real connection in the first place: the specs that drive
// the sync client inject their own socket (`SyncSocketOptions.socketFactory`), and everything
// else reaching `new WebSocket()` — `roomSync.start()` by way of `roomsStore.begin()` — is
// doing so incidentally, at the live API's URL. So this one is installed unconditionally
// rather than behind the `typeof … === 'undefined'` guard the stubs above use: a real
// implementation being present is precisely the problem. It connects to nothing and fires
// no handler, which is the honest stand-in for a socket a test never meant to open.
class InertWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState = InertWebSocket.CONNECTING
  binaryType = 'blob'
  bufferedAmount = 0
  extensions = ''
  protocol = ''
  readonly url: string

  onopen: unknown = null
  onmessage: unknown = null
  onclose: unknown = null
  onerror: unknown = null

  constructor (url: string | URL) {
    this.url = String(url)
  }

  send (): void {}

  close (): void {
    this.readyState = InertWebSocket.CLOSED
  }

  addEventListener (): void {}
  removeEventListener (): void {}
  dispatchEvent (): boolean {
    return true
  }
}

for (const target of [globalThis, window]) {
  Object.defineProperty(target, 'WebSocket', { value: InertWebSocket, writable: true, configurable: true })
}

// Nothing in a unit test may reach the network. `config.apiUrl` points at a dead port under
// Vitest, so a stray request cannot travel — but a request that fails at the socket is still a
// request, and this app reads a network failure as its offline path: a spec that forgot to mock
// the API would quietly exercise offline behaviour and pass, which is how the sync stores would
// come to be tested against the wrong thing. Refuse it outright instead, and say what to mock.
//
// It rejects rather than throwing, because that is what `fetch` does and what the callers are
// written for: `api/client.ts` wraps a failure in `ApiNetworkError`, and the telemetry beacon
// swallows one on purpose. Which is also why the refusal is announced on the process's own
// stderr — a swallowed rejection would be exactly as silent as the request it replaced, and the
// reporter keeps a passing test's console to itself.
const refusedUrls = new Set<string>()

const refuseNetwork = (input: unknown): Promise<never> => {
  const url = typeof input === 'string'
    ? input
    : String((input as { url?: unknown })?.url ?? input)
  const message = `A unit test tried to reach the network: fetch(${url}). Mock the module that ` +
    'calls it — `@/api/client` for the planner\'s API — rather than letting the request out.'

  if (!refusedUrls.has(url)) {
    refusedUrls.add(url)
    process.stderr.write(`${message}\n`)
  }

  return Promise.reject(new TypeError(message))
}

// `writable`/`configurable`, so a spec's own `vi.stubGlobal('fetch', …)` still replaces it — and
// is put back to this, rather than to the real thing, by `vi.unstubAllGlobals()`.
for (const target of [globalThis, window]) {
  Object.defineProperty(target, 'fetch', { value: refuseNetwork, writable: true, configurable: true })
}

// jsdom never loads images, so an <img> stays `complete: false` with a zero natural
// size forever — and Vuetify's VImg keeps re-arming its 100ms size poll to wait for
// one. Nothing unmounts those components, so the timers outlive the jsdom teardown
// between test files and throw `window is not defined`, which Vitest counts as an
// unhandled error and exits 1 on. Report a size so the poll settles on its first tick.
for (const prop of ['naturalWidth', 'naturalHeight'] as const) {
  Object.defineProperty(HTMLImageElement.prototype, prop, { configurable: true, get: () => 1 })
}

// Vitest's worker console buffers what is logged and ships it to the reporter over the worker's
// rpc channel. That channel is closed the moment the file's tests are over, and any call still
// in flight is rejected with `Closing rpc while "onUserConsoleLog" was pending` — an unhandled
// rejection Vitest counts as an error and exits 1 on. One more red run with every test green.
//
// What it catches is the app's own logging, arriving late: the store's load chain and its 500ms
// persist debounce both keep going after the test that started them returned, and both log
// generously on the way. `afterPaint` and `loadPause` in `app-store.ts` already close the two
// widest gaps at the source, and a full run still leaves around seventy lines landing after the
// test that caused them — each one a chance to be the call that teardown rejects. Rather than
// ask every future spec to await a chain it never started on purpose, stop logging once the
// tests are over. Nothing readable is lost: Vitest keeps a passing test's console output to
// itself, `pnpm test` passes `--silent` on top of that, and a line logged after the last test
// belongs to no test to be printed under in any case.
//
// Scoped to the file, and only the file: `pool: 'forks'` gives each spec file its own process,
// so this console dies with it. Registered from a setup file, so it is the first `afterAll` on
// the root suite — and hooks running in reverse (`sequence.hooks: 'stack'`), the last to run.
afterAll(() => {
  const quietened = ['log', 'info', 'debug', 'dir', 'table', 'trace', 'warn', 'error'] as const
  const quiet = Object.fromEntries(quietened.map(method => [method, () => {}]))
  // One object under jsdom, but a Set keeps this honest if the two ever differ.
  for (const target of new Set([globalThis.console, window.console])) {
    Object.assign(target, quiet)
  }
})

let gameData: any = null
let gameDataVersion: string | null = null

try {
  gameData = JSON.parse(readFileSync(
    path.join(__dirname, `../public/gameData_v${config.dataVersion}.json`),
    { encoding: 'utf-8' },
  ))
  gameDataVersion = config.dataVersion
} catch (err) {
  console.error('Cannot load local game data', err)
}

// Load game data from local file
vi.mock('./stores/local-game-data-loader.ts', () => {
  return {
    loadLocalGameData: () => {
      return {
        gameData,
        version: gameDataVersion,
      }
    },
  }
})

// Serve game data from the local file instead of HTTP. Without this, specs importing
// the calc engine (building-groups/common.ts top-level-awaits fetchGameData) depend on
// vitest's port-3001 test server — which silently skips startup if anything else (e.g.
// the backend dev server) is squatting that port, failing the suite with fetch errors.
vi.mock('./utils/gameDataService.ts', () => {
  return {
    fetchGameData: async () => gameData,
  }
})

// Create pinia so that stores that are created during module don't throw
// errors because pinia is not set up.
setActivePinia(createPinia())

// window polyfills, required by components that use some special vuetify components.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  })
}
