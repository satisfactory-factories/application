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

  // First, try the local test server.
  const testUrl = 'http://localhost:3001/gameData.json'
  try {
    const response = await fetch(testUrl)
    if (!response.ok) {
      throw new Error(`Request to ${testUrl} failed with status ${response.status}`)
    }
    return await response.json()
  } catch (err) {
    // If the request to the test server fails, log and fall back.
    console.warn(`Failed to fetch from ${testUrl}: ${err}. Falling back to /gameData.json`)
    const prodUrl = `/gameData_v${dataVersion}.json`
    const response = await fetch(prodUrl)
    if (!response.ok) {
      throw new Error(`Request to ${prodUrl} failed with status ${response.status}`)
    }
    const data = await response.json()

    cacheData(data)
    return data
  }
}

function cacheData (data: DataInterface) {
  console.log('gameDataService: cacheData', data)
  gameDataCache = data
}
