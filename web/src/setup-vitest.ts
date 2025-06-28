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
    dispatchEvent: () => {},
  })
}
