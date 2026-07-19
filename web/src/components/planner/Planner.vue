<template>
  <introduction source="planner" />
  <world-import :show-import-world-popup @close-world-import="closeWorldImport" />
  <world-data v-if="showWorldData" />
  <planner-too-many-factories-open :factories="getFactories()" @hide-all="showHideAll('hide')" />

  <building-group-tutorial />
  <div class="planner-container">
    <!-- Navigation Drawer for Mobile -->
    <Teleport v-if="navigationReady" defer to="#navigationDrawer">
      <planner-factory-list
        :factories="getFactories()"
        loaded-from="navigation"
        :total-factories="getFactories().length"
        @create-factory="createFactory"
        @update-factories="updateFactoriesList"
      />
      <planner-global-actions
        class="py-4"
        :help-text-shown="helpText"
        @clear-all="clearAll"
        @hide-all="showHideAll('hide')"
        @import-world="importWorld"
        @show-all="showHideAll('show')"
        @toggle-help-text="toggleHelp()"
      />
    </Teleport>

    <!-- Main Content Area -->
    <v-row class="ma-0">
      <!-- Hot zone to peek the sidebar when it's collapsed -->
      <div
        v-if="!showSidebar"
        class="d-none d-lg-block sidebar-hover-zone"
        @mouseenter="sidebarPeek = true"
      />
      <!-- Sticky Sidebar for Desktop -->
      <v-col
        class="d-none d-lg-flex sticky-sidebar"
        :class="{ collapsed: !showSidebar, peek: sidebarPeek && !showSidebar, nudge: sidebarNudge }"
        :style="{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px`, maxWidth: `${sidebarWidth}px` }"
        @animationend.self="onNudgeEnd"
        @mouseleave="sidebarPeek = false"
      >
        <v-container class="pa-0 sidebar-content">
          <planner-factory-list
            :factories="getFactories()"
            loaded-from="planner"
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
            @import-world="importWorld"
            @show-all="showHideAll('show')"
            @toggle-help-text="toggleHelp()"
          />
        </v-container>
        <div
          v-if="showSidebar"
          class="sidebar-resize-handle"
          :class="{ resizing: isResizingSidebar }"
          @mousedown.prevent="startSidebarResize"
        />
      </v-col>
      <!-- Main Content Area -->
      <v-col v-if="!planVisible" class="border-s-lg-lg pa-3 main-content">
        <planner-factory-placeholder-list />
      </v-col>
      <v-col v-if="planVisible" class="border-s-lg-lg pa-3 main-content">
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
    Factory,
    WorldRawResource,
  } from '@/interfaces/planner/FactoryInterface'
  import { DataInterface } from '@/interfaces/DataInterface'
  import { useAppStore } from '@/stores/app-store'
  import { removeFactoryDependants } from '@/utils/factory-management/dependencies'
  import {
    calculateFactories,
    calculateFactory,
    CalculationModes,
    findFac,
    newFactory,
    regenerateSortOrders, reorderFactory,
  } from '@/utils/factory-management/factory'
  import { useGameDataStore } from '@/stores/game-data-store'
  import eventBus from '@/utils/eventBus'
  import BuildingGroupTutorial from '@/components/planner/products/BuildingGroupTutorial.vue'

  const { getGameData } = useGameDataStore()
  const gameData = getGameData()

  const { getFactories, setFactories, clearFactories, addFactory } = useAppStore()

  const worldRawResources = reactive<{ [key: string]: WorldRawResource }>({})
  const helpText = ref(localStorage.getItem('helpText') === 'true')

  const planVisible = ref(false)
  const navigationReady = ref(false)

  const showImportWorldPopup = ref<boolean>(false)
  const showWorldData = ref<boolean>(false)

  const showSidebar = ref<boolean>(localStorage.getItem('sidebarOpen') !== 'false')
  const sidebarPeek = ref<boolean>(false)

  const sidebarNudge = ref<boolean>(false)
  const onNudgeEnd = () => {
    sidebarNudge.value = false
    localStorage.setItem('sidebarNudgeShown', 'true')
  }

  const defaultSidebarWidth = 375
  const minSidebarWidth = 150
  const sidebarWidth = ref<number>(parseInt(localStorage.getItem('sidebarWidth') ?? '', 10) || defaultSidebarWidth)
  const isResizingSidebar = ref<boolean>(false)

  const startSidebarResize = (event: MouseEvent) => {
    isResizingSidebar.value = true
    const startX = event.clientX
    const startWidth = sidebarWidth.value

    // Lock the cursor and text selection for the duration of the drag
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX)
      sidebarWidth.value = Math.min(Math.max(newWidth, minSidebarWidth), window.innerWidth / 2)
    }
    const onMouseUp = () => {
      isResizingSidebar.value = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('sidebarWidth', String(Math.round(sidebarWidth.value)))
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ### EVENT BUS LISTENERS ###
  // When we are starting a new load we need to unload all the DOM elements
  eventBus.on('plannerShow', (show: boolean) => {
    if (!show) {
      console.log('Planner: Received plannerShow(false) event, marked as unloaded, showing placeholders')
      hidePlan()
    } else {
      console.log('Planner: Received plannerShow(true) event, showing content')
      showPlan()
    }
  })

  // When everything is loaded and ready to go, then we are ready to start loading things.
  eventBus.on('loadingCompleted', () => {
    console.log('Planner: Received loadingCompleted event, booting planner')
    showPlan()
  })

  eventBus.on('worldDataShow', (value: boolean) => {
    showWorldData.value = value
  })

  eventBus.on('navigationReady', () => {
    console.log('Planner: Received navigationReady event, teleporting factory list')
    navigationReady.value = true
  })

  eventBus.on('toggleSidebar', () => {
    showSidebar.value = !showSidebar.value
    sidebarPeek.value = false
    console.log('Planner: Received toggleSidebar event, toggling sidebar visibility', showSidebar.value)

    if (showSidebar.value) {
      sidebarNudge.value = false
    } else if (localStorage.getItem('sidebarNudgeShown') !== 'true') {
      // First ever hide: once the collapse slide finishes, nudge the sidebar
      // out briefly so the user learns the hover zone exists.
      setTimeout(() => {
        sidebarNudge.value = true
      }, 300)
    }
  })
  // #############s

  // ==== WATCHES
  watch(helpText, newValue => {
    localStorage.setItem('helpText', JSON.stringify(newValue))
  })

  watch(showSidebar, newValue => {
    localStorage.setItem('sidebarOpen', JSON.stringify(newValue))
    eventBus.emit('sidebarChanged', newValue)
  })

  const showPlan = () => {
    resyncWorldResources()
    planVisible.value = true

    // If another page (e.g. Parts & Recipes) requested a jump to a factory, honour it once rendered.
    const pendingNav = sessionStorage.getItem('navigateToFactory')
    if (pendingNav) {
      sessionStorage.removeItem('navigateToFactory')
      setTimeout(() => navigateToFactory(pendingNav), 250)
    }
  }

  const hidePlan = () => {
    planVisible.value = false
  }

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
  const updateFactory = (factory: Factory, modes: CalculationModes = {}) => {
    calculateFactory(factory, getFactories(), gameData, modes)
  }

  const copyFactory = (originalFactory: Factory) => {
    // Make a deep copy of the factory with a new ID
    const newId = Math.floor(Math.random() * 10000)
    const newFactory: Factory = {
      ...JSON.parse(JSON.stringify(originalFactory)),
      id: newId,
      name: `${originalFactory.name} (copy)`,
      displayOrder: originalFactory.displayOrder + 1,
    }

    // Remove GameSync data from the new factory
    newFactory.syncState = {}
    newFactory.syncStatePower = {}
    newFactory.inSync = null

    getFactories().push(newFactory)

    // Update the display order of the other factory
    if (newFactory.displayOrder > originalFactory.displayOrder && newFactory.id !== newId) {
      newFactory.displayOrder += 1
    }

    // Now call calculateFactories in case the clone's imports cause a deficit
    calculateFactories(getFactories(), gameData)

    regenerateSortOrders(getFactories())
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
      regenerateSortOrders(getFactories())
    } else {
      console.error('Factory not found to delete?!')
    }
  }

  const importWorld = () => {
    console.log('Open Import World')
    showImportWorldPopup.value = true
  }

  const closeWorldImport = () => {
    showImportWorldPopup.value = false
  }

  const clearAll = () => {
    clearFactories()
    updateWorldRawResources(gameData)
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
    reorderFactory(factory, direction, getFactories())
  }

  const forceSort = () => {
    // Forcefully regenerate the displayOrder counting upwards.
    getFactories().forEach((factory, index) => {
      factory.displayOrder = index
    })
  }

  const resyncWorldResources = () => {
    Object.assign(worldRawResources, generateRawResources(gameData))
    updateWorldRawResources(gameData)
  }

  provide('findFactory', findFactory)
  provide('updateFactory', updateFactory)
  provide('copyFactory', copyFactory)
  provide('deleteFactory', deleteFactory)
  provide('navigateToFactory', navigateToFactory)
  provide('moveFactory', moveFactory)

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

  .sidebar-hover-zone {
    position: fixed;
    top: calc(64px + 50px);
    left: 0;
    width: 16px;
    height: calc(100vh - 64px - 50px);
    z-index: 99;
  }

  .sticky-sidebar {
    position: relative; // Anchor for the resize handle
    max-height: calc(100vh - 64px - 50px); // For some reason this is not relative to the planner container
    overflow: hidden; // Scrolling happens inside .sidebar-content so the handle spans the full height

    .sidebar-content {
      max-height: 100%;
      overflow-y: auto;
    }

    .sidebar-resize-handle {
      position: absolute;
      top: 0;
      right: 0;
      width: 8px;
      height: 100%;
      cursor: col-resize;
      border-right: 2px solid rgba(255, 255, 255, 0.12);

      &:hover, &.resizing {
        border-right-color: rgb(var(--v-theme-primary));
      }
    }

    // Collapsed: taken out of the layout flow and parked off-screen so the
    // main content takes the full width. Peek slides it back over the content.
    &.collapsed {
      position: fixed;
      top: calc(64px + 50px);
      left: 0;
      height: calc(100vh - 64px - 50px);
      background: rgb(var(--v-theme-background));
      transform: translateX(-100%);
      transition: transform 0.2s ease;
      z-index: 100;
    }

    &.collapsed.peek {
      transform: translateX(0);
      box-shadow: 4px 0 12px rgba(0, 0, 0, 0.5);
    }

    // First-hide hint: pop out a little, wiggle, slide back
    &.collapsed.nudge {
      animation: sidebar-nudge 1.1s ease-in-out;
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

@keyframes sidebar-nudge {
  0%, 100% { transform: translateX(-100%); }
  15%, 45%, 75% { transform: translateX(calc(-100% + 56px)); }
  30%, 60% { transform: translateX(calc(-100% + 32px)); }
}
</style>
