<template>
  <introduction :intro-show="introShow" @close-intro="closeIntro" @show-demo="setupDemo" />
  <planner-too-many-factories-open :factories="getFactories()" @hide-all="showHideAll('hide')" />
  <div class="planner-container">
    <Teleport v-if="mdAndDown" defer to="#navigationDrawer">
      <planner-factory-list
        :factories="getFactories()"
        :total-factories="getFactories().length"
        @create-factory="createFactory"
        @update-factories="updateFactoriesList"
      />
      <planner-global-actions
        class="py-4"
        :help-text-shown="helpText"
        @clear-all="clearAll"
        @hide-all="showHideAll('hide')"
        @show-all="showHideAll('show')"
        @show-intro="showIntro"
        @toggle-help-text="toggleHelp()"
      />
    </Teleport>
    <v-row class="two-pane-container">
      <!-- Sticky Sidebar for Desktop -->
      <v-col class="d-none d-lg-flex sticky-sidebar">
        <v-container class="pa-0">
          <planner-factory-list
            :factories="getFactories()"
            :total-factories="getFactories().length"
            @create-factory="createFactory"
            @update-factories="updateFactoriesList"
          />
          <v-divider color="#ccc" thickness="2px" />
          <planner-global-actions
            class="py-2"
            :help-text-shown="helpText"
            @clear-all="clearAll"
            @hide-all="showHideAll('hide')"
            @show-all="showHideAll('show')"
            @show-intro="showIntro"
            @toggle-help-text="toggleHelp()"
          />
        </v-container>
      </v-col>
      <!-- Main Content Area -->
      <v-col v-if="loadingCompleted" class="border-s-lg pa-3 main-content">
        <notice />
        <statistics v-if="getFactories().length !== 0" :factories="getFactories()" :help-text="helpText" />
        <statistics-factory-summary v-if="getFactories().length !== 0" :factories="getFactories()" :help-text="helpText" />
        <planner-factory
          v-for="(factory) in getFactories()"
          :key="factory.id"
          :factory="factory"
          :help-text="helpText"
          :total-factories="getFactories().length"
        />
        <div class="mt-4 text-center">
          <v-btn
            color="primary"
            prepend-icon="fas fa-plus"
            size="large"
            @click="createFactory()"
          >Add Factory</v-btn>
        </div>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
  import { provide, reactive, ref, watch } from 'vue'

  import PlannerGlobalActions from '@/components/planner/PlannerGlobalActions.vue'
  import {
    ByProductItem,
    Factory,
    FactoryItem,
    WorldRawResource,
  } from '@/interfaces/planner/FactoryInterface'
  import { DataInterface } from '@/interfaces/DataInterface'
  import { useAppStore } from '@/stores/app-store'
  import {
    removeFactoryDependants,
  } from '@/utils/factory-management/dependencies'
  import { calculateFactories, calculateFactory, findFac, newFactory } from '@/utils/factory-management/factory'
  import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'
  import { useDisplay } from 'vuetify'
  import { useGameDataStore } from '@/stores/game-data-store'
  import eventBus from '@/utils/eventBus'

  const { mdAndDown } = useDisplay()
  const { getGameData } = useGameDataStore()
  const gameData = getGameData()

  const { getFactories, setFactories, clearFactories, addFactory, startLoad } = useAppStore()

  const worldRawResources = reactive<{ [key: string]: WorldRawResource }>({})
  const helpText = ref(localStorage.getItem('helpText') === 'true')

  const loadingCompleted = ref(false)

  // Watch for the event that's emitted when appStore has loaded the data
  eventBus.on('loadingCompleted', () => {
    console.log('Planner: Got loadingCompleted event')
    loadingCompleted.value = true
    console.log('Planner: Factories loaded:', getFactories())
  })

  // When we are starting a new load we need to unload all the DOM elements
  eventBus.on('showLoading', () => {
    console.log('Planner: Received showLoading event, marking as unloaded')
    loadingCompleted.value = false
  })

  // ==== WATCHES
  watch(helpText, newValue => {
    localStorage.setItem('helpText', JSON.stringify(newValue))
  })

  const createFactory = () => {
    const factory = newFactory()
    factory.displayOrder = getFactories().length
    addFactory(factory)
    navigateToFactory(factory.id)
  }

  // This function calculates the world resources available after each group has consumed Raw Resources.
  // This is done here globally as it loops all factories. It is not appropriate to be done on group updates.
  const updateWorldRawResources = (gameData: DataInterface): void => {
    // Generate fresh world resources as a baseline for calculation.
    Object.assign(worldRawResources, generateRawResources(gameData))

    // Loop through each group's products to calculate usage of raw resources.
    getFactories().forEach(factory => {
      factory.products.forEach(product => {
        const recipe = gameData.recipes.find(r => r.id === product.recipe)
        if (!recipe) {
          console.error(`Recipe with ID ${product.id} not found.`)
          return
        }

        // Loop through each ingredient in the recipe (array of objects).
        recipe.ingredients.forEach(ingredient => {
          // Extract the ingredient name and amount.
          if (isNaN(ingredient.amount)) {
            console.warn(`Invalid ingredient amount for ingredient "${ingredient.part}". Skipping.`)
            return
          }

          if (!worldRawResources[ingredient.part]) {
            return
          }

          const resource = worldRawResources[ingredient.part]

          // Update the world resource by reducing the available amount.
          worldRawResources[ingredient.part].amount = resource.amount - (ingredient.amount * product.amount)
        })
      })
    })
  }

  // Resets the world's raw resources counts according to the limits provided by the data.
  const generateRawResources = (gameData: DataInterface): { [key: string]: WorldRawResource } => {
    const ores = {} as { [key: string]: WorldRawResource }

    Object.keys(gameData.items.rawResources).forEach(name => {
      const resource = gameData.items.rawResources[name]
      ores[name] = {
        id: name,
        name: resource.name,
        amount: resource.limit,
      }
    })

    // Return a sorted object by the name property. Key is not correct.
    const sortedOres = Object.values(ores).sort((a, b) => a.name.localeCompare(b.name))

    const sortedOresAsObj: {[key: string]: WorldRawResource } = {}
    sortedOres.forEach(ore => {
      sortedOresAsObj[ore.id] = ore
    })

    return sortedOresAsObj
  }

  const findFactory = (factoryId: string | number): Factory | null => {
    return findFac(factoryId, getFactories())
  }

  const updateFactoriesList = (newFactories: Factory[]) => {
    setFactories(newFactories)
    forceSort()
    console.log('Factories updated and re-sorted')
  }

  // Proxy method so we don't have to pass the gameData and getFactories() around to every single subcomponent
  const updateFactory = (factory: Factory) => {
    calculateFactory(factory, getFactories(), gameData)
  }

  const copyFactory = (originalFactory: Factory) => {
    // Make a deep copy of the factory with a new ID
    const newId = Math.floor(Math.random() * 10000)
    const newFactory = {
      ...JSON.parse(JSON.stringify(originalFactory)),
      id: newId,
      name: `${originalFactory.name} (copy)`,
      displayOrder: originalFactory.displayOrder + 1,
    }
    getFactories().push(newFactory)

    // Update the display order of the other factory
    if (newFactory.displayOrder > originalFactory.displayOrder && newFactory.id !== newId) {
      newFactory.displayOrder += 1
    }

    // Now call calculateFactories in case the clone's imports cause a deficit
    calculateFactories(getFactories(), gameData)

    regenerateSortOrders()
    navigateToFactory(newId)
  }

  const deleteFactory = (factory: Factory) => {
    // Find the index of the factory to delete
    const index = getFactories().findIndex(fac => fac.id === factory.id)

    if (index !== -1) {
      removeFactoryDependants(factory, getFactories())

      getFactories().splice(index, 1) // Remove the factory at the found index
      updateWorldRawResources(gameData) // Recalculate the world resources

      // After deleting the factory, loop through all factories and update them as inputs / exports have likely changed.
      calculateFactories(getFactories(), gameData)

      // Regenerate the sort orders
      regenerateSortOrders()
    } else {
      console.error('Factory not found to delete?!')
    }
  }

  const clearAll = () => {
    clearFactories()
    updateWorldRawResources(gameData)
  }

  const getProduct = (factory: Factory, productId: string): FactoryItem | ByProductItem | undefined => {
    const product = factory.products.find(product => product.id === productId)
    const byProduct = factory.byProducts.find(product => product.id === productId)
    return product ?? byProduct ?? undefined
  }

  const getBuildingDisplayName = (building: string) => {
    const buildingFriendly = new Map<string, string>([
      ['assemblermk1', 'Assembler'],
      ['blender', 'Blender'],
      ['constructormk1', 'Constructor'],
      ['converter', 'Converter'],
      ['foundrymk1', 'Foundry'],
      ['hadroncollider', 'Particle Accelerator'],
      ['generatorbiomass', 'Biomass Burner'],
      ['generatorcoal', 'Coal-Powered Generator'],
      ['generatorfuel', 'Fuel-Powered Generator'],
      ['generatornuclear', 'Nuclear Power Plant'],
      ['manufacturermk1', 'Manufacturer'],
      ['oilrefinery', 'Oil Refinery'],
      ['packager', 'Packager'],
      ['quantumencoder', 'Quantum Encoder'],
      ['smeltermk1', 'Smelter'],
      ['waterExtractor', 'Water Extractor'],
    ])

    return buildingFriendly.get(building) || `UNKNOWN BUILDING: ${building}`
  }

  const showHideAll = (mode: 'show' | 'hide') => {
    getFactories().forEach(factory => factory.hidden = mode === 'hide')
  }

  const toggleHelp = () => {
    helpText.value = !helpText.value
  }

  const navigateToFactory = (factoryId: number | string, subsection?: string) => {
    const facId = parseInt(factoryId.toString(), 10)
    const factory = findFac(facId, getFactories())
    if (!factory) {
      console.error(`navigateToFactory: Factory ${factoryId} not found!`)
      return
    }
    // Unhide the factory which makes more sense than the user being scrolled to it than having to open it.
    factory.hidden = false

    // Wait a bit for the factory to unhide fully. Hack but works well.
    setTimeout(() => {
      // Navigate to it
      const factoryElement = document.getElementById(subsection ?? `${factoryId}`)
      if (factoryElement) {
        factoryElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 50)
  }

  const moveFactory = (factory: Factory, direction: string) => {
    const currentOrder = factory.displayOrder
    let targetOrder

    if (direction === 'up' && currentOrder > 0) {
      targetOrder = currentOrder - 1
    } else if (direction === 'down' && currentOrder < getFactories().length - 1) {
      targetOrder = currentOrder + 1
    } else {
      return // Invalid move
    }

    // Find the target factory and swap display orders
    const targetFactory = getFactories().find(fac => fac.displayOrder === targetOrder)
    if (targetFactory) {
      targetFactory.displayOrder = currentOrder
      factory.displayOrder = targetOrder
    }

    regenerateSortOrders()
  }

  const regenerateSortOrders = () => {
    // Sort now, which may have sorted them weirdly
    setFactories(getFactories().sort((a, b) => a.displayOrder - b.displayOrder))

    // Ensure that the display order is correct
    getFactories().forEach((factory, index) => {
      factory.displayOrder = index
    })

    // Now re-sort
    setFactories(getFactories().sort((a, b) => a.displayOrder - b.displayOrder))
  }

  const forceSort = () => {
    // Forcefully regenerate the displayOrder counting upwards.
    getFactories().forEach((factory, index) => {
      factory.displayOrder = index
    })
  }

  const initializeFactories = () => {
    Object.assign(worldRawResources, generateRawResources(gameData))
    updateWorldRawResources(gameData)

    // Once we're fully loaded, hide the loading screen
    eventBus.emit('hideLoading')
  }

  const isItemRawResource = (item: string): boolean => {
    return !!gameData.items.rawResources[item]
  }

  // When everything is loaded and ready to go, then we are ready to start loading things.
  eventBus.on('loadingCompleted', () => {
    console.log('Planner: Received loadingCompleted event, initializing factories...')
    initializeFactories()
  })

  provide('findFactory', findFactory)
  provide('updateFactory', updateFactory)
  provide('copyFactory', copyFactory)
  provide('deleteFactory', deleteFactory)
  provide('getBuildingDisplayName', getBuildingDisplayName)
  provide('navigateToFactory', navigateToFactory)
  provide('moveFactory', moveFactory)
  provide('isItemRawResource', isItemRawResource)
  provide('getProduct', getProduct)

  // Grab from local storage if the user has already dismissed this popup
  // If they have, don't show it again.
  const introShow = ref<boolean>(!localStorage.getItem('dismissed-introduction'))

  let factoriesToLoad: Factory[] = []

  const setupDemo = () => {
    if (getFactories().length > 0) {
      if (!confirm('Showing the demo will clear the current plan. Are you sure you wish to do this?')) {
        return // User cancelled
      }
    }
    closeIntro()
    factoriesToLoad = complexDemoPlan().getFactories()
    startLoad(factoriesToLoad)
  }

  const closeIntro = () => {
    console.log('closing intro')
    introShow.value = false
    localStorage.setItem('dismissed-introduction', 'true')
  }

  const showIntro = () => {
    console.log('showing intro')
    introShow.value = true
  }
</script>

<style scoped lang="scss">
.planner-container {
  width: 100%;
  height: calc(100vh - 64px - 50px);

  @media screen and (min-width: 2000px) {
    margin-left: 10vw;
    width: 90vw;
  }

  @media screen and (min-width: 2560px) {
    margin-left: calc((100vw - 2050px)/2) !important;
  }

  .two-pane-container {
    margin: 0;
  }

  .sticky-sidebar {
    width: 375px;
    max-width: 375px;
    max-height: calc(100vh - 64px - 50px); // For some reason this is not relative to the planner container
    overflow-y: auto; /* Make it scrollable */

    @media screen and (max-width: 1500px) {
      width: 275px;
      max-width: 275px;
    }
  }

  .main-content {
    width: 100%;
    max-height: calc(100vh - 64px - 50px);
    overflow-y: auto;

    @media screen and (min-width: 2000px) {
      padding-right: 10vw !important;
    }

    @media screen and (min-width: 2560px) {
      padding-right: calc(100vw - 1800px - 20vw) !important;
    }
  }
}
</style>
