import { useGameDataStore } from '@/stores/game-data-store'
import { Factory } from '@/interfaces/planner/FactoryInterface'

const gameDataStore = useGameDataStore()
const gameData = gameDataStore.getGameData()

export const getPartDisplayName = (part: string | number | null): string => {
  if (!part) {
    return 'NO PART!!!'
  }
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
