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
