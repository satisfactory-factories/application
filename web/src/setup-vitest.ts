import { vi } from 'vitest'
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

// jsdom never loads images, so an <img> stays `complete: false` with a zero natural
// size forever — and Vuetify's VImg keeps re-arming its 100ms size poll to wait for
// one. Nothing unmounts those components, so the timers outlive the jsdom teardown
// between test files and throw `window is not defined`, which Vitest counts as an
// unhandled error and exits 1 on. Report a size so the poll settles on its first tick.
for (const prop of ['naturalWidth', 'naturalHeight'] as const) {
  Object.defineProperty(HTMLImageElement.prototype, prop, { configurable: true, get: () => 1 })
}

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
