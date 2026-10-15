import { computed } from 'vue'
import { useAppStore } from '@/stores/app-store'
import { useGameDataStore } from '@/stores/game-data-store'
import { analyseNetwork } from '@/utils/factory-management/train-logistics'

// Every train in the plan, from loading station to receiving station. A train ties two factories
// together, so the export side and the import side both read the whole plan.
export const useRailNetwork = () => {
  const appStore = useAppStore()
  const gameData = useGameDataStore().getGameData()
  const factories = computed(() => appStore.getFactories())
  const network = computed(() => analyseNetwork(factories.value, gameData))
  return { factories, network }
}
