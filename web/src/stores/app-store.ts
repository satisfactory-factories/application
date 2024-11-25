// Utilities
import { defineStore } from 'pinia'
import { Factory, FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { ref, watch } from 'vue'
import { calculateFactories } from '@/utils/factory-management/factory'
import { useGameDataStore } from '@/stores/game-data-store'

export const useAppStore = defineStore('app', () => {
  const factoryTabs = ref<FactoryTab[]>(JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as FactoryTab[])

  if (factoryTabs.value.length === 0) {
    factoryTabs.value = [
      {
        id: crypto.randomUUID(),
        name: 'Default',
        // Fill the tabs from the legacy factories array if present so no data gets lost
        factories: JSON.parse(localStorage.getItem('factories') ?? '[]'),
      },
    ]
  }

  const currentFactoryTabIndex = ref(0)
  const currentFactoryTab = computed(() => factoryTabs.value[currentFactoryTabIndex.value])

  const factories = computed({
    get () {
      return currentFactoryTab.value.factories
    },
    set (value) {
      currentFactoryTab.value.factories = value
    },
  })

  const lastSave = ref<Date>(new Date(localStorage.getItem('lastSave') ?? ''))
  const lastEdit = ref<Date>(new Date(localStorage.getItem('lastEdit') ?? ''))
  const isDebugMode = ref<boolean>(false)
  const gameDataStore = useGameDataStore()

  // Watch the factories array for changes
  watch(factoryTabs.value, () => {
    localStorage.setItem('factoryTabs', JSON.stringify(factoryTabs.value))
    setLastEdit() // Update last edit time whenever the data changes, from any source.
  }, { deep: true })

  const getLastEdit = (): Date => {
    return lastEdit.value
  }

  const setLastEdit = () => {
    lastEdit.value = new Date()
    localStorage.setItem('lastEdit', lastEdit.value.toISOString())
  }
  const setLastSave = () => {
    lastSave.value = new Date()
    localStorage.setItem('lastSave', lastSave.value.toISOString())
  }

  // ==== FACTORY MANAGEMENT
  // This function is needed to ensure that data fixes are applied as we migrate things and change things around.
  const getFactories = () => {
    // Patch for old data pre #116
    factories.value.forEach(factory => {
      if (!factory.exports) {
        factory.exports = {}
      }
    })

    return factories.value
  }

  const setFactories = (newFactories: Factory[]) => {
    console.log('Setting factories', newFactories)
    const gameData = gameDataStore.getGameData()
    if (!gameData) {
      console.error('Unable to load game data!')
      return
    }

    factories.value = newFactories
    // Trigger calculations
    calculateFactories(factories.value, gameData)
    // Will also call the watcher.
  }

  const addFactory = (factory: Factory) => {
    factories.value.push(factory)
  }

  const removeFactory = (id: number) => {
    const index = getFactories().findIndex(factory => factory.id === id)
    if (index !== -1) {
      factories.value.splice(index, 1)
    }
  }

  const clearFactories = () => {
    factories.value.length = 0
    factories.value = []
  }
  // ==== END FACTORY MANAGEMENT

  // ==== TAB MANAGEMENT
  const addTab = ({
    id = crypto.randomUUID(),
    name = 'New Tab',
    factories = [],
  } = {} as Partial<FactoryTab>) => {
    factoryTabs.value.push({
      id,
      name,
      factories,
    })

    currentFactoryTabIndex.value = factoryTabs.value.length - 1
  }

  const removeCurrentTab = async () => {
    if (factoryTabs.value.length === 1) return

    if (factories.value.length && !window.confirm('Are you sure you want to delete this tab? This will delete all factories in it.')) {
      return
    }

    factoryTabs.value.splice(currentFactoryTabIndex.value, 1)
    currentFactoryTabIndex.value = Math.min(currentFactoryTabIndex.value, factoryTabs.value.length - 1)
  }
  // ==== END TAB MANAGEMENT

  // ==== MISC
  const debugMode = () => {
    const route = useRoute()

    if (window.location.hostname !== 'satisfactory-factories.app') {
      return true
    }
    return route.query.debug === 'true'
  }

  isDebugMode.value = debugMode()
  // ==== END MISC

  return {
    currentFactoryTab,
    currentFactoryTabIndex,
    factoryTabs,
    factories,
    lastSave,
    lastEdit,
    isDebugMode,
    getLastEdit,
    setLastSave,
    setLastEdit,
    getFactories,
    setFactories,
    addFactory,
    removeFactory,
    clearFactories,
    addTab,
    removeCurrentTab,
  }
})
