import { DataInterface } from '@/interfaces/DataInterface'
import { config } from '@/config/config'

const dataVersion = config.dataVersion ?? ''
let gameDataCache: DataInterface | null = null

export async function fetchGameData (): Promise<DataInterface> {
  // Try the cache first
  if (gameDataCache) {
    console.log('gameDataService: fetchGameData: cache hit')
    return gameDataCache
  }

  // In local dev only, prefer the parser's test server if it's running, so a dev who
  // regenerates gameData sees it without a rebuild. This MUST NOT happen in production:
  // a public page fetching localhost trips Chromium's Local Network Access permission
  // prompt ("wants to access other apps and services on this device") on load. Vite
  // statically replaces import.meta.env.DEV with false in the build, so this whole
  // branch — and the localhost URL — is tree-shaken out of the production bundle.
  if (import.meta.env.DEV) {
    const testUrl = 'http://localhost:3001/gameData.json'
    try {
      const response = await fetch(testUrl)
      if (!response.ok) {
        throw new Error(`Request to ${testUrl} failed with status ${response.status}`)
      }
      const data = await response.json()
      cacheData(data)
      return data
    } catch (err) {
      // Test server not running — fall back to the shipped file below.
      console.warn(`Failed to fetch from ${testUrl}: ${err}. Falling back to /gameData.json`)
    }
  }

  const prodUrl = `/gameData_v${dataVersion}.json`
  const response = await fetch(prodUrl)
  if (!response.ok) {
    throw new Error(`Request to ${prodUrl} failed with status ${response.status}`)
  }
  const data = await response.json()

  cacheData(data)
  return data
}

function cacheData (data: DataInterface) {
  console.log('gameDataService: cacheData', data)
  gameDataCache = data
}
