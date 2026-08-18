import { useGameDataStore } from '@/stores/game-data-store'
import { Factory } from '@/interfaces/planner/FactoryInterface'

// Resolved per call, not once at import. Reaching for the store at module scope makes this file
// unimportable before `app.use(pinia)` runs — and since importing is transitive, one util quietly
// pulling this in is enough to take the whole app down at boot with an error that names Pinia and
// nothing else. The store is a memoised singleton, so asking it each time costs nothing.
const currentGameData = () => useGameDataStore().getGameData()

export const getPartDisplayName = (part: string | number | null): string => {
  if (!part) {
    return 'NO PART!!!'
  }
  const gameData = currentGameData()
  if (!gameData) {
    console.error('getPartDisplayName: No game data!!')
    return 'NO DATA!!!'
  }
  return gameData.items.rawResources[part]?.name ||
    gameData.items.parts[part]?.name ||
    `UNKNOWN PART ${part}!`
}

export const hasMetricsForPart = (factory: Factory, part: string) => {
  return factory.dependencies.metrics && factory.dependencies.metrics[part]
}

export const differenceClass = (difference: number) => {
  return {
    'text-green': difference > 0,
    'text-red': difference < 0,
  }
}

export const confirmDialog = (message: string): boolean => {
  return window.confirm(message)
}

export const replacePlaceholders = (inputString: string, valuesArray: string[]) => {
  return inputString.replace(/\$(\d+)/g, (match, index) => {
    const valueIndex = parseInt(index, 10) - 1
    return valuesArray[valueIndex] || match
  })
}
