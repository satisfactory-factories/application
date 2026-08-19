<template>
  <introduction source="planner" />
  <world-import :show-import-world-popup @close-world-import="closeWorldImport" />
  <world-data v-if="showWorldData" />
  <planner-too-many-factories-open :factories="getFactories()" @hide-all="showHideAll('hide')" />

  <building-group-tutorial />
  <div class="planner-container" :class="{ 'full-width': plannerOptions.fullWidth }">
    <!-- Navigation Drawer for Mobile -->
    <Teleport v-if="navigationReady" defer to="#navigationDrawer">
      <planner-sidebar-content
        :factories="getFactories()"
        :help-text-shown="helpText"
        loaded-from="navigation"
        @clear-all="clearAll"
        @create-factory="createFactory"
        @hide-all="showHideAll('hide')"
        @import-world="importWorld"
        @show-all="showHideAll('show')"
        @toggle-help-text="toggleHelp()"
        @update-factories="updateFactoriesList"
      />
    </Teleport>

    <!-- Main Content Area -->
    <v-row class="ma-0">
      <!-- Sticky Sidebar for Desktop -->
      <v-col
        class="d-none d-lg-flex sticky-sidebar"
        :class="{ collapsed: !showSidebar, peek: sidebarPeek && !showSidebar, nudge: sidebarNudge }"
        :style="{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px`, maxWidth: `${sidebarWidth}px` }"
        @animationend.self="onNudgeEnd"
        @mouseleave="onSidebarMouseLeave"
      >
        <v-container class="pa-0 sidebar-content">
          <planner-sidebar-content
            :factories="getFactories()"
            :help-text-shown="helpText"
            loaded-from="planner"
            @clear-all="clearAll"
            @create-factory="createFactory"
            @hide-all="showHideAll('hide')"
            @import-world="importWorld"
            @show-all="showHideAll('show')"
            @toggle-help-text="toggleHelp()"
            @update-factories="updateFactoriesList"
          />
        </v-container>
        <div
          v-if="showSidebar || sidebarPeek"
          class="sidebar-resize-handle"
          :class="{ resizing: isResizingSidebar }"
          @mousedown.prevent="startSidebarResize"
        />
      </v-col>
      <!-- Main Content Area -->
      <v-col v-if="!planVisible" class="border-s-lg-lg pa-3 main-content">
        <planner-factory-placeholder-list />
      </v-col>
      <v-col v-if="planVisible" class="border-s-lg-lg pa-3 main-content" @scroll.passive="onMainContentScroll">
        <statistics v-if="getFactories().length !== 0" :factories="getFactories()" :help-text="helpText" />
        <statistics-factory-summary v-if="getFactories().length !== 0" :factories="getFactories()" :help-text="helpText" />
        <template v-for="section in groupSections" :key="section.group?.id ?? 'ungrouped'">
          <!-- A plan that has never used groups is one Ungrouped section, and a band over the
               whole plan says nothing — so it only appears once there is something to divide. -->
          <planner-group-band
            v-if="groupSections.length > 1"
            :collapsed="sectionCollapsed(section)"
            :count="section.factories.length"
            :factories="section.factories"
            :group="section.group"
            @toggle="toggleSection(section)"
          />
          <!-- Hidden rather than removed once the group has been open: rebuilding forty cards on
               every collapse is what made the toggle take seconds. A group already shut when the
               plan loads never mounts them at all.

               The wrapper is load-bearing: PlannerFactory renders a row AND the divider that
               follows it, and v-show on a two-root component is silently dropped, so collapsing
               hid nothing at all. -->
          <template v-if="sectionMounted(section)">
            <!-- The tree the sidebar draws, brought over to the cards: without it a group's
                 members are only distinguishable by the band above them and the group chip on each
                 header, which is not enough to see where a group starts and stops while scrolling.
                 Ungrouped is deliberately left flat — indenting everything distinguishes nothing. -->
            <div
              v-for="(factory, index) in section.factories"
              v-show="!sectionCollapsed(section)"
              :key="factory.id"
              :class="section.group ? ['group-tree-item', { first: index === 0, last: index === section.factories.length - 1 }] : undefined"
              :style="section.group ? groupColorVars(section.group.color) : undefined"
            >
              <planner-factory
                :factory="factory"
                :help-text="helpText"
                :total-factories="getFactories().length"
              />
            </div>
          </template>
        </template>
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
  import { computed, onMounted, onUnmounted, provide, reactive, ref, toRaw, watch } from 'vue'
  import { useDisplay } from 'vuetify'

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
    generateFactoryId,
    newFactory,
    regenerateSortOrders, reorderFactory,
  } from '@/utils/factory-management/factory'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'
  import { usePlannerOptions } from '@/composables/usePlannerOptions'
  import { useFactoryDrag } from '@/composables/useFactoryDrag'
  import { useGroupCollapse } from '@/composables/useGroupCollapse'
  import { FactoryGroupSection } from '@/utils/factory-management/factory-groups'
  import eventBus from '@/utils/eventBus'
  import BuildingGroupTutorial from '@/components/planner/products/BuildingGroupTutorial.vue'
  import PlannerGroupBand from '@/components/planner/groups/PlannerGroupBand.vue'
  import { groupColorVars } from '@/utils/colors'
  import { flashElement } from '@/utils/navigation-highlight'

  const { getGameData } = useGameDataStore()
  const gameData = getGameData()

  const { getFactories, setFactories, clearFactories, addFactory } = useAppStore()

  const { sections: groupSections, moveFactoryToGroup } = useFactoryGroups()
  const plannerOptions = usePlannerOptions()
  const { isCollapsed, isMounted, setCollapsed, toggleCollapsed, usePlan } = useGroupCollapse()

  // Which plan's collapse state is in play. Group ids survive a copied plan, and Ungrouped has no
  // id at all, so without this two tabs would drive each other's sections.
  const appStore = useAppStore()
  watch(
    () => appStore.getCurrentTab()?.id,
    id => {
      if (id) usePlan(id)
    },
    { immediate: true },
  )

  const sectionCollapsed = (section: FactoryGroupSection) => isCollapsed(section.group?.id ?? null)
  const sectionMounted = (section: FactoryGroupSection) => isMounted(section.group?.id ?? null)
  const toggleSection = (section: FactoryGroupSection) => toggleCollapsed(section.group?.id ?? null)

  const worldRawResources = reactive<{ [key: string]: WorldRawResource }>({})
  const helpText = ref(localStorage.getItem('helpText') === 'true')

  const planVisible = ref(false)
  const navigationReady = ref(false)

  const showImportWorldPopup = ref<boolean>(false)
  const showWorldData = ref<boolean>(false)

  const showSidebar = ref<boolean>(localStorage.getItem('sidebarOpen') !== 'false')
  const sidebarPeek = ref<boolean>(false)

  // Below the lg breakpoint the docked sidebar doesn't exist (the nav drawer
  // tray takes over), so peeking is meaningless there.
  const { lgAndUp } = useDisplay()
  watch(lgAndUp, isDesktop => {
    if (!isDesktop) sidebarPeek.value = false
  })

  // Peek the collapsed sidebar when the cursor travels anywhere near the left
  // edge. A window-level listener rather than a hover strip: it doesn't sit
  // over (and steal clicks from) the content, and a wider zone still works in
  // floating windows where there's no screen edge to catch the cursor.
  const peekZoneWidth = 48
  const peekTopOffset = 64 + 50 // Toolbar + tab bar, matching the CSS offsets below

  const onPeekMouseMove = (event: MouseEvent) => {
    cancelProvisionalPeek()
    if (showSidebar.value || !lgAndUp.value || peekLocked.value) return
    if (!sidebarPeek.value && event.clientX <= peekZoneWidth && event.clientY >= peekTopOffset) {
      sidebarPeek.value = true
    } else if (sidebarPeek.value && event.clientX > sidebarWidth.value) {
      sidebarPeek.value = false
    }
  }

  // The peeked tray must survive the cursor briefly outrunning the edge while
  // it's being drag-resized.
  const onSidebarMouseLeave = () => {
    if (!peekLocked.value) {
      sidebarPeek.value = false
    }
  }

  // A cursor flung out through the window's left edge never produces a
  // mousemove inside the zone — catch the exit itself. But an exit is
  // ambiguous: the cursor may be hovering just past a floating window's edge
  // (wants the peek) or on its way to another monitor (doesn't). There's no
  // API to ask where the cursor is once it's outside, so the peek is
  // provisional: kept only if a mousemove confirms the cursor came back.
  const peekGraceMs = 1000
  let provisionalPeekTimer: number | null = null

  const cancelProvisionalPeek = () => {
    if (provisionalPeekTimer !== null) {
      clearTimeout(provisionalPeekTimer)
      provisionalPeekTimer = null
    }
  }

  const onPeekMouseOut = (event: MouseEvent) => {
    if (showSidebar.value || !lgAndUp.value || peekLocked.value || event.relatedTarget) return
    if (event.clientX <= peekZoneWidth && event.clientY >= peekTopOffset) {
      sidebarPeek.value = true
      cancelProvisionalPeek()
      provisionalPeekTimer = window.setTimeout(() => {
        provisionalPeekTimer = null
        if (!peekLocked.value) sidebarPeek.value = false
      }, peekGraceMs)
    }
  }

  // Alt-tabbing away leaves no mouse events behind — without this the tray
  // stays open in the now-background window.
  const onWindowBlur = () => {
    if (!peekLocked.value) {
      cancelProvisionalPeek()
      sidebarPeek.value = false
    }
  }

  onMounted(() => {
    window.addEventListener('mousemove', onPeekMouseMove)
    window.addEventListener('mouseout', onPeekMouseOut)
    window.addEventListener('blur', onWindowBlur)
  })
  onUnmounted(() => {
    window.removeEventListener('mousemove', onPeekMouseMove)
    window.removeEventListener('mouseout', onPeekMouseOut)
    window.removeEventListener('blur', onWindowBlur)
    cancelProvisionalPeek()
    if (activeFactoryScan !== null) cancelAnimationFrame(activeFactoryScan)
  })

  const sidebarNudge = ref<boolean>(false)
  const onNudgeEnd = () => {
    sidebarNudge.value = false
    localStorage.setItem('sidebarNudgeShown', 'true')
  }

  const defaultSidebarWidth = 375
  // The floor the status chips need: several item icons plus a label like "3 shortages" in one
  // unbreakable chip, inside a column that hides its overflow. Narrower silently cut the label off.
  const minSidebarWidth = 300
  // Clamped on read as well as on drag — a width stored before this floor existed would otherwise
  // stick until the next resize.
  const storedSidebarWidth = Number.parseInt(localStorage.getItem('sidebarWidth') ?? '', 10)
  const sidebarWidth = ref<number>(
    storedSidebarWidth ? Math.max(storedSidebarWidth, minSidebarWidth) : defaultSidebarWidth
  )
  const isResizingSidebar = ref<boolean>(false)

  // Reasons the peeked tray must stay put regardless of where the cursor goes. Resizing is one:
  // the cursor routinely outruns the edge it is dragging. A sidebar drag is the other — dropping
  // the tray mid-drag takes the drop targets with it, and the pointer events that would peek it
  // back out don't arrive while a drag is in flight.
  const { draggingSidebarItem } = useFactoryDrag()
  const peekLocked = computed(() => isResizingSidebar.value || draggingSidebarItem.value)

  // Force the tray out for the duration of a drag started from it, and hand it back to the normal
  // peek rules on drop rather than slamming it shut: the cursor may well have finished inside the
  // tray, and the next mousemove or mouseleave closes it if it hasn't.
  watch(draggingSidebarItem, dragging => {
    if (!dragging || showSidebar.value || !lgAndUp.value) return
    cancelProvisionalPeek()
    sidebarPeek.value = true
  })

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

  // Scroll-spy for the sidebar: tracks which factory card currently sits under the
  // fixed chrome so the factory list can mark the one being looked at. Reads are
  // batched behind rAF — a fast scroll fires far more events than painted frames.
  // A factory id, or one of the section element ids ('statistics' / 'factory-summary').
  const activeFactoryId = ref<number | string | null>(null)
  let activeFactoryScan: number | null = null

  // Where the user's "eyes" are assumed to be: 10% down the planner pane, not its very
  // top edge — a factory scrolled slightly past its header is still the one being looked
  // at. A scrolled-to card lands at the pane top, so the navigation target always spans
  // this line (unless the card is shorter than the 10%, i.e. collapsed).
  const getActivationLine = (): number => {
    const main = document.querySelector('.main-content')
    if (!main) return 160
    const rect = main.getBoundingClientRect()
    return rect.top + rect.height * 0.1
  }

  const onMainContentScroll = () => {
    if (activeFactoryScan !== null) return
    activeFactoryScan = requestAnimationFrame(() => {
      activeFactoryScan = null
      updateActiveFactory()
    })
  }

  const updateActiveFactory = () => {
    const activationLine = getActivationLine()
    // Sections then factories, matching document order — so once an entry starts
    // below the line, no later one can span it.
    // Group bands are in the list too: a collapsed group contributes no cards, so without its
    // band there is a stretch of the page nothing claims and the highlight sticks behind.
    const entries: (number | string)[] = [
      'statistics',
      'factory-summary',
      ...groupSections.value.flatMap(section => [
        `group-${section.group?.id ?? 'ungrouped'}`,
        ...(sectionCollapsed(section) ? [] : section.factories.map(factory => factory.id)),
      ]),
    ]
    for (const entry of entries) {
      const rect = document.getElementById(`${entry}`)?.getBoundingClientRect()
      if (!rect) continue
      if (rect.top > activationLine) break
      if (rect.bottom > activationLine) {
        activeFactoryId.value = entry
        return
      }
    }
    // Nothing spans the line — it's sitting in the gap/divider between cards.
    // Stay sticky on the previous entry rather than dropping the highlight.
  }

  const showPlan = () => {
    resyncWorldResources()
    planVisible.value = true

    // Restore the indicator once the cards have had a beat to render.
    setTimeout(updateActiveFactory, 300)

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

  // `groupId` is where the click came from: a group's own Add Factory button in the sidebar names
  // its group, everything else leaves the factory ungrouped as it always has.
  const createFactory = (groupId: string | null = null) => {
    const factory = newFactory()
    factory.displayOrder = getFactories().length
    addFactory(factory)
    // Grouped after the fact rather than born into it: addFactory cannot see where the click came
    // from, and seats every new factory at the end of the Ungrouped block. The move re-seats it at
    // the end of its group and re-sorts the plan, so the card lands where the sidebar row is.
    if (groupId) moveFactoryToGroup(factory.id, groupId)
    // Reads the factory's group, so it opens the right one — hence after the move, not before.
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
          if (Number.isNaN(ingredient.amount)) {
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

    const sortedOresAsObj: { [key: string]: WorldRawResource } = {}
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
    // Make a deep copy of the factory with a new ID, unique against the rest of the plan.
    const newId = generateFactoryId(getFactories())
    const newFactory: Factory = {
      ...structuredClone(toRaw(originalFactory)),
      id: newId,
      name: `${originalFactory.name} (copy)`,
      displayOrder: originalFactory.displayOrder + 1,
    }

    // Remove GameSync data from the new factory
    newFactory.syncState = {}
    newFactory.syncStatePower = {}
    newFactory.inSync = null

    // The clone inherits the original's exports, but the importers are still buying from
    // the original — leaving them on renders as an export nobody asked for until the flush
    // tears them (and a recalculation of every affected factory) back down.
    newFactory.dependencies = { requests: {}, metrics: {} }

    // The clone inherits the original's group (structuredClone carried it), so seat it directly
    // after the original. Appending and re-sorting would drop it at the end of that group.
    const originalIndex = getFactories().indexOf(originalFactory)
    getFactories().splice(originalIndex + 1, 0, newFactory)
    getFactories().forEach((entry, index) => {
      entry.displayOrder = index
    })

    // Now call calculateFactories in case the clone's imports cause a deficit
    calculateFactories(getFactories(), gameData)

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

  // `subsection` may name a row that isn't on screen (a status chip jumping to the product that
  // owns the problem), so callers pass the section as a fallback rather than the jump silently
  // doing nothing. Several rows can be named at once — a chip reading "3 shortages" is about
  // three of them — in which case the jump lands on the topmost and lights all three.
  const navigateToFactory = (factoryId: number | string, subsection?: string | string[], fallback?: string) => {
    const facId = Number.parseInt(factoryId.toString(), 10)
    const factory = findFac(facId, getFactories())
    if (!factory) {
      console.error(`navigateToFactory: Factory ${factoryId} not found!`)
      return
    }
    // Unhide the factory which makes more sense than the user being scrolled to it than having to open it.
    factory.hidden = false

    // Same reasoning one step out: a card inside a collapsed group is hidden and has nothing to
    // scroll to, so every jump into one — a status chip, a pending session navigation, a link from
    // another page — would silently do nothing. Open the group first.
    setCollapsed(factory.group?.id ?? null, false)

    const requested = Array.isArray(subsection) ? subsection : subsection ? [subsection] : []

    // The card itself is the last resort behind whatever the caller named: a jump that aims at a
    // row inside a card that has not rendered yet would otherwise land nowhere at all, and being
    // taken to the factory beats being taken nowhere.
    const fallbacks = fallback ? [fallback, `${factoryId}`] : [`${factoryId}`]

    // Wait a bit for the factory to unhide fully. Hack but works well.
    setTimeout(() => scrollToElement(
      requested.length ? requested : [`${factoryId}`],
      fallbacks
    ), 50)
  }

  // Scrolls to the target, then corrects for layout shifts: factory cards materialize as they
  // scroll past the viewport, growing the content above the target and leaving the scroll short.
  //
  // Every target is a row the jump is about, and every one of them that exists is flashed; the
  // scroll lands on whichever sits highest up the page, so the rest follow it down the screen.
  // The `fallbacks` stand in, in preference order, only while none of the targets are in the DOM
  // — a row inside a card that has not materialized yet is not there at click time, and the
  // correction passes are where it appears, which is why the ids are re-resolved on every
  // attempt.
  //
  // `flashed` carries the ids already pulsed down those passes, so a row that turns up late gets
  // its flash without re-flashing what the user is already looking at.
  const scrollToElement = (
    candidates: string | string[],
    fallbacks: string | string[] = [],
    attempt = 0,
    flashed: string[] = []
  ) => {
    const targets = Array.isArray(candidates) ? candidates : [candidates]
    const standIns = Array.isArray(fallbacks) ? fallbacks : [fallbacks]
    const present = targets.filter(id => document.getElementById(id))
    const standIn = standIns.find(id => document.getElementById(id))
    const ids = present.length ? present : (standIn ? [standIn] : [])
    if (!ids.length) return

    const topOf = (id: string) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity
    const anchorId = ids.reduce((highest, id) => topOf(id) < topOf(highest) ? id : highest)

    // Corrections snap instantly - re-running the smooth animation would chase a moving target.
    document.getElementById(anchorId)!.scrollIntoView({
      behavior: attempt === 0 ? 'smooth' : 'auto',
      block: 'start',
    })

    const pending = ids.filter(id => !flashed.includes(id))
    const flashAll = () => pending.forEach(id => {
      const arrived = document.getElementById(id)
      if (arrived) flashElement(arrived)
    })
    // Give the smooth scroll a beat to land first. Pulsing the moment it sets off means the flash
    // is half over by the time the target is on screen — the correction passes below arrive
    // mid-pulse, which is exactly when the user is looking at it.
    if (attempt === 0) setTimeout(flashAll, 350)
    else flashAll()

    if (attempt >= 4) return
    setTimeout(() => {
      // Re-query rather than closing over the element — cards materializing
      // above can replace the node, and a detached node's rect reads 0,
      // which silently skips the correction.
      const current = document.getElementById(anchorId)
      if (!current) return
      // ~114px is where the top of a scrolled-to element sits (page header + tab bar), and a row
      // jumped to from a status chip adds its 50px scroll-margin on top of that — so the tolerance
      // has to clear both, or the correction pass fights the margin it just applied.
      const scrolledShort = Math.abs(current.getBoundingClientRect().top) > 200
      // Keep looking while any target is still missing — we are either parked on the fallback or
      // showing only some of the rows the jump is about, and settling for either would leave the
      // rest unlit.
      if (scrolledShort || present.length < targets.length) {
        scrollToElement(targets, standIns, attempt + 1, [...flashed, ...pending])
      }
    }, 600)
  }

  const moveFactory = (factory: Factory, direction: string) => {
    reorderFactory(factory, direction, getFactories())
  }

  // Scroll to a non-factory section (Statistics, Factories Summary) by its element id.
  // The section may be collapsed — tell it to show itself first (each listens for its own
  // id), give the reveal a beat to change the layout, then scroll. scrollToElement's
  // correction passes absorb any further shifts from content still materializing.
  // Right after page load the section components may not be mounted yet, so a single
  // emit can vanish into the void — keep re-emitting until the element exists (bounded).
  const navigateToSection = (sectionId: string, attempt = 0) => {
    eventBus.emit('openSection', sectionId)
    if (!document.getElementById(sectionId)) {
      if (attempt < 20) {
        setTimeout(() => navigateToSection(sectionId, attempt + 1), 250)
      }
      return
    }
    setTimeout(() => scrollToElement(sectionId), 50)
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
  provide('activeFactoryId', activeFactoryId)
  provide('navigateToSection', navigateToSection)
  provide('moveFactory', moveFactory)

</script>

<style scoped lang="scss">
// Fixed chrome sitting above the planner. These MUST include the borders, or
// the content regions overshoot the viewport by a few pixels and the whole
// document gains a second scrollbar on top of the regions' own overflow.
//   header  = 64px v-toolbar + 1px bottom border (.main-header)
//   tab bar = 48px v-tabs + 2px top + 2px bottom border (.tab-bar)
$header-height: 65px;
$tab-bar-height: 52px;
$chrome-height: $header-height + $tab-bar-height; // 117px

// The group tree over the cards. Same shape and the same geometry names as the sidebar's, so the
// two read as one idea seen at two sizes — see PlannerSidebarGroup.
$tree-indent: 20px;
$tree-line: 3px;
// Where the elbow meets the card. The sidebar aims at the middle of a row; a factory card is
// hundreds or thousands of pixels tall, so a midpoint elbow would point at nothing. This aims at
// the card's title line, measured in the browser at a constant 56px from the top of the wrapper
// whatever the card holds. The min() is for a collapsed card shorter than that, so the elbow and
// the corner stay inside it rather than hanging off the bottom.
$tree-elbow-top: 56px;
// The breathing room between a band and its first card. Carried as that card's padding rather
// than the band's margin, so it falls inside the trunk and the line arrives unbroken.
$band-gap: 8px;

.group-tree-item {
  position: relative;
  padding-left: $tree-indent;
  // Contains the card's own margins — the divider that ends each one carries my-6, whose bottom
  // margin otherwise escapes the wrapper and leaves a 12px hole in the trunk between cards. Same
  // reason the sidebar's .tree-item does it.
  display: flow-root;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 0;
    background-color: var(--sf-group, #6c6c6c);
  }

  // Trunk, one segment per card, meeting the segment above and below so the group reads as one
  // line down its edge. The last card stops it at its own elbow, which draws the corner.
  &::before {
    top: 0;
    bottom: 0;
    width: $tree-line;
  }

  &.last::before {
    bottom: auto;
    height: min(#{$tree-elbow-top + $tree-line}, 100%);
  }

  &::after {
    top: min(#{$tree-elbow-top}, calc(100% - #{$tree-line}));
    width: $tree-indent;
    height: $tree-line;
  }

  // Padding shifts the card but not the pseudo-elements, which resolve against the padding box,
  // so the first card's elbow has to come down by the same amount to stay on its title line.
  &.first {
    padding-top: $band-gap;

    &::after {
      top: $tree-elbow-top + $band-gap;
    }

    // A group of one is both ends of the tree at once, so its trunk has to end at the elbow the
    // rule above just moved. Left at the shared height it stopped short of it and the corner came
    // away from the line.
    &.last::before {
      height: min(#{$tree-elbow-top + $band-gap + $tree-line}, 100%);
    }
  }

  // The rule each card ends with divides cards inside a group; at the end of one it divides
  // nothing, since the corner of the tree and the next band already say the group has finished,
  // and left in it draws straight across that corner. Hidden rather than removed — the rule
  // carries the my-6 that spaces the next band off the last card, and display: none takes the
  // gap with it.
  &.last :deep(.factory-divider) {
    border-color: transparent;
  }
}

.planner-container {
  width: 100%;
  height: calc(100vh - #{$chrome-height});

  @media screen and (min-width: 2000px) {
    margin-left: 10vw;
    width: 90vw;
  }

  @media screen and (min-width: 2560px) {
    margin-left: calc((100vw - 2050px)/2) !important;
  }

  .sticky-sidebar {
    position: relative; // Anchor for the resize handle
    height: calc(100vh - #{$chrome-height}); // Fill the viewport even when the plan is empty/short
    overflow: hidden; // Scrolling happens inside .sidebar-content so the handle spans the full height

    .sidebar-content {
      max-height: 100%;
      overflow-y: auto;
      overflow-x: hidden; // Negative row margins in children must not create a horizontal scrollbar
    }

    .sidebar-resize-handle {
      position: absolute;
      top: 0;
      right: 0;
      width: 8px;
      height: 100%;
      cursor: col-resize;
      border-right: 2px solid color-mix(in srgb, var(--sf-header-border) 35%, transparent);

      &:hover, &.resizing {
        border-right-color: var(--sf-header-border);
      }
    }

    // Collapsed: taken out of the layout flow and parked off-screen so the
    // main content takes the full width. Peek slides it back over the content.
    &.collapsed {
      position: fixed;
      top: $chrome-height;
      left: 0;
      height: calc(100vh - #{$chrome-height});
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
    max-height: calc(100vh - #{$chrome-height});
    overflow-y: auto;

    @media screen and (min-width: 2000px) {
      padding-right: 10vw !important;
    }

    @media screen and (min-width: 2560px) {
      padding-right: calc(100vw - 1800px - 20vw) !important;
    }
  }
}

// Full width: drop the wide-screen gutters and let the plan have the whole window. The gutters
// above stop a factory card stretching into an unreadable line on a big monitor, but a plan whose
// satisfaction and summary tables are already scrolling sideways would rather have the pixels —
// so which of the two applies is the reader's call, from the sidebar's global actions.
// Below 2000px there are no gutters to drop and this changes nothing.
.planner-container.full-width {
  @media screen and (min-width: 2000px) {
    margin-left: 0;
    width: 100%;
  }

  // The rule this overrides is itself !important, so this has to be too — specificity alone
  // cannot beat it.
  @media screen and (min-width: 2560px) {
    margin-left: 0 !important;
  }

  .main-content {
    // Back to the pa-3 the column carries at every other width, rather than 0: the cards need
    // the same breathing room off the right edge that they have off the left.
    @media screen and (min-width: 2000px) {
      padding-right: 12px !important;
    }
  }
}

@keyframes sidebar-nudge {
  0%, 100% { transform: translateX(-100%); }
  15%, 45%, 75% { transform: translateX(calc(-100% + 56px)); }
  30%, 60% { transform: translateX(calc(-100% + 32px)); }
}
</style>
