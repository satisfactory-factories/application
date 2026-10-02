<template>
  <introduction source="planner" />
  <world-import :show-import-world-popup @close-world-import="closeWorldImport" />
  <world-data v-if="showWorldData" />

  <building-group-tutorial />
  <awesome-sink-tutorial />
  <dimensional-depot-tutorial />
  <checklist-tutorial />
  <linked-import-tick-dialog />
  <div class="planner-container" :class="{ 'full-width': plannerOptions.fullWidth }">
    <!-- Navigation Drawer for Mobile -->
    <Teleport v-if="navigationReady" defer to="#navigationDrawer">
      <planner-sidebar-content
        :factories="getFactories()"
        loaded-from="navigation"
        @clear-all="clearAll"
        @create-factory="createFactory"
        @import-world="importWorld"
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
            loaded-from="planner"
            @clear-all="clearAll"
            @create-factory="createFactory"
            @import-world="importWorld"
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
        <!-- One page at a time: a single factory, or the overview when none is open. Mounting
             every card at once is what made a big plan lag and crash the tab; the sidebar and the
             pagers either side of the card are how the rest of the plan is reached. -->
        <!-- Switching page drops a curtain over the pane at once, showing the outline of a factory
             while the new page is built behind it, then fades the curtain away. The curtain is only
             as big as the visible pane, so it costs the same whatever the page holds (see
             swapPage). Sticky, so it covers the pane wherever it is scrolled. -->
        <div class="page-curtain-anchor">
          <div class="page-curtain" :class="{ 'page-curtain-shown': curtainShown }">
            <!-- Laid out like the page it stands in for: the real pager, which costs next to
                 nothing, then a ghost of the card, so nothing moves when the page replaces it. -->
            <div v-if="skeletonOn" class="pa-3">
              <template v-if="currentFactory">
                <planner-factory-pager
                  direction="previous"
                  :from="currentFactory"
                  :target="neighboursOf(factoryOrder, currentFactory.id).previous"
                />
              </template>
              <planner-factory-skeleton :factory="currentFactory" />
            </div>
          </div>
        </div>
        <div class="planner-page">
          <template v-if="shownFactory">
            <planner-factory-pager
              v-if="neighbours"
              direction="previous"
              :from="shownFactory"
              :target="neighbours.previous"
              @go="goToNeighbour"
            />
            <planner-factory
              :key="shownFactory.id"
              :factory="shownFactory"
              :reveal-rest="revealRest"
              :total-factories="getFactories().length"
              @rendered="onFactoryRendered"
            />
            <planner-factory-pager
              v-if="neighbours?.next"
              direction="next"
              :from="shownFactory"
              :target="neighbours.next"
              @go="goToNeighbour"
            />
          </template>
          <template v-else-if="shownView === OVERVIEW">
            <statistics v-if="getFactories().length !== 0" :factories="getFactories()" />
            <!-- The bottom gap rides on whichever section is last, so the run of top-level sections
                 is evenly spaced however many of them are showing. -->
            <statistics-factory-summary
              v-if="getFactories().length !== 0"
              :class="{ 'mb-4': !usesDimensionalDepot }"
              :factories="getFactories()"
            />
            <!-- Only once the plan actually uses the Depot. An empty section on every plan would be a
                 permanent advert for a feature the satisfaction table already offers in place. -->
            <dimensional-depot v-if="usesDimensionalDepot" class="mb-4" :factories="getFactories()" />
            <planner-factory-pager
              v-if="factoryOrder.length"
              direction="next"
              :from="null"
              :target="factoryOrder[0]"
              @go="goToNeighbour"
            />
          </template>
          <!-- Inside the page, so it fades with it rather than jumping up while the pane is empty. -->
          <div class="mt-4 text-center">
            <v-btn
              color="primary"
              data-testid="add-factory"
              prepend-icon="fas fa-plus"
              size="large"
              @click="createFactory()"
            >Add Factory</v-btn>
          </div>
        </div>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, toRaw, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useRouter } from 'vue-router'

  import {
    Factory,
    WorldRawResource,
  } from '@/interfaces/planner/FactoryInterface'
  import { DataInterface } from '@/interfaces/DataInterface'
  import { useAppStore } from '@/stores/app-store'
  import { removeFactoryDependants } from '@/utils/factory-management/dependencies'
  import { resetChecklistState } from '@/utils/factory-management/checklist'
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
  import { useJumpHistory } from '@/composables/useJumpHistory'
  import { useFactoryView } from '@/composables/useFactoryView'
  import {
    neighboursOf,
    OVERVIEW,
    parseView,
    serialiseView,
    sidebarOrder,
    viewAfterRemoving,
  } from '@/utils/factory-management/planner-view'
  import eventBus from '@/utils/eventBus'
  import { captureOrder, markFactoryRemoved, markReorderedFactories } from '@/utils/sync-intent'
  import BuildingGroupTutorial from '@/components/planner/products/BuildingGroupTutorial.vue'
  import AwesomeSinkTutorial from '@/components/planner/AwesomeSinkTutorial.vue'
  import DimensionalDepotTutorial from '@/components/planner/DimensionalDepotTutorial.vue'
  import ChecklistTutorial from '@/components/planner/ChecklistTutorial.vue'
  import LinkedImportTickDialog from '@/components/planner/LinkedImportTickDialog.vue'
  import PlannerFactoryPager from '@/components/planner/PlannerFactoryPager.vue'
  import DimensionalDepot from '@/components/planner/DimensionalDepot.vue'
  import { flashElement } from '@/utils/navigation-highlight'

  const { getGameData } = useGameDataStore()
  const gameData = getGameData()

  const { getFactories, setFactories, clearFactories, addFactory } = useAppStore()

  const { sections: groupSections, moveFactoryToGroup } = useFactoryGroups()
  const plannerOptions = usePlannerOptions()
  const { setCollapsed, usePlan } = useGroupCollapse()
  const { view, setView, usePlan: useViewPlan } = useFactoryView()

  // Which plan's collapse state and open factory are in play. Group ids survive a copied plan, and
  // factory ids are only unique within one, so without this two tabs would drive each other.
  const appStore = useAppStore()
  watch(
    () => appStore.getCurrentTab()?.id,
    id => {
      if (!id) return
      usePlan(id)
      useViewPlan(id)
    },
    { immediate: true },
  )

  // ==== THE PAGE ON SCREEN
  // The pane shows one factory or the overview, never the whole plan. Next and previous walk the
  // plan in the order the sidebar lists it.
  const factoryOrder = computed(() => sidebarOrder(groupSections.value))

  // Null means the overview. A remembered factory that has gone — deleted on another device, or a
  // plan replaced by an import — falls back to it rather than leaving the pane empty.
  const currentFactory = computed<Factory | null>(() => {
    const open = view.value
    if (open === OVERVIEW) return null
    return factoryOrder.value.find(factory => factory.id === open) ?? null
  })

  // The page actually rendered, which trails the one asked for by a fade: the old page stays
  // until it has faded out, and the new one goes in while the pane is invisible.
  const shownView = ref<typeof OVERVIEW | number>(currentFactory.value?.id ?? OVERVIEW)

  // A factory deleted while on screen renders nothing for the fade out, rather than a card for a
  // factory the engine no longer holds.
  const shownFactory = computed<Factory | null>(() => {
    const shown = shownView.value
    if (shown === OVERVIEW) return null
    return factoryOrder.value.find(factory => factory.id === shown) ?? null
  })

  const neighbours = computed(() =>
    shownFactory.value ? neighboursOf(factoryOrder.value, shownFactory.value.id) : null
  )

  // Work that has to wait for the page being switched to: positioning it on the row a jump is
  // aiming at. Run once the page has rendered and before it fades in, so it arrives already in
  // place rather than scrolling there in front of the user.
  let pendingArrival: (() => void) | null = null

  // Matches the opacity transition on .page-curtain.
  const PAGE_FADE_MS = 150
  // The longest a new page waits for the browser to go quiet before fading in anyway.
  const PAGE_SETTLE_MS = 150
  // The longest a jump waits for the whole factory to render before positioning on what is there.
  const PAGE_RENDER_LIMIT_MS = 2000

  // The curtain over the pane, which hides it while the page underneath is swapped.
  const curtainShown = ref(false)
  let swapToken = 0

  const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  // A freshly mounted factory keeps the main thread busy for a while after it is in the DOM
  // (images, observers, layout); fading in on top of that is what stutters.
  const settled = () => new Promise<void>(resolve => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: PAGE_SETTLE_MS })
    else setTimeout(resolve, 50)
  })

  // Whether the factory on screen may mount the sections below Products. Held back while it fades
  // in, so the long task of mounting them does not land inside the fade.
  const revealRest = ref(true)
  // The skeleton outlives the curtain by its fade out, so it does not vanish mid-fade.
  const skeletonOn = ref(false)
  let resolveRendered: (() => void) | null = null
  const onFactoryRendered = () => {
    resolveRendered?.()
    resolveRendered = null
  }

  // Drop the curtain over the old page, swap the content behind it, let the new page render,
  // position it, then fade the curtain away. A plain switch lifts it once the top of the factory is
  // ready and mounts the rest afterwards, below the fold; a jump aiming at a row waits for the whole card,
  // since the row may be anywhere in it. Each stage checks it is still the latest switch, so
  // clicking through several factories quickly lands on the last one without replaying the rest.
  const swapPage = async () => {
    const token = ++swapToken
    // At once rather than faded in: the skeleton is what says the click landed.
    curtainShown.value = true
    skeletonOn.value = true
    // Two frames, so the skeleton (and the clicked row's flash) is painted before the mount that
    // follows holds the main thread.
    await nextFrame()
    await nextFrame()
    if (token !== swapToken) return
    document.querySelector<HTMLElement>('.main-content')?.scrollTo({ top: 0, behavior: 'auto' })
    const target = currentFactory.value?.id ?? OVERVIEW
    // A page already on screen keeps what it has rendered, so only a fresh one is waited on.
    const needsWholeCard = pendingArrival !== null && target !== OVERVIEW && target !== shownView.value
    const rendered = needsWholeCard
      ? new Promise<void>(resolve => { resolveRendered = resolve })
      : null
    revealRest.value = target === OVERVIEW
    shownView.value = target
    await nextTick()
    // Still staged when the whole card is needed, just without waiting for the fade: a stage per
    // frame keeps the page responsive, where mounting it all at once would freeze it.
    if (rendered) {
      revealRest.value = true
      await Promise.race([rendered, wait(PAGE_RENDER_LIMIT_MS)])
    }
    await nextFrame()
    await settled()
    if (token !== swapToken) return
    const arrive = pendingArrival
    pendingArrival = null
    arrive?.()
    await nextFrame()
    if (token !== swapToken) return
    curtainShown.value = false
    await wait(PAGE_FADE_MS)
    if (token !== swapToken) return
    skeletonOn.value = false
    revealRest.value = true
  }

  watch(() => currentFactory.value?.id ?? OVERVIEW, target => {
    if (target !== shownView.value || curtainShown.value) void swapPage()
  })

  const goToNeighbour = (target: Factory | typeof OVERVIEW) => {
    if (target === OVERVIEW) navigateToSection('statistics')
    else navigateToFactory(target.id)
  }

  const worldRawResources = reactive<{ [key: string]: WorldRawResource }>({})

  // Cheap: a key count on a map that is empty for every plan that does not use the feature, so
  // this does not walk the parts of every factory on each render.
  const usesDimensionalDepot = computed(() => getFactories().some(
    factory => Object.values(factory.partDisposal ?? {}).some(disposal => disposal.depots > 0)
  ))

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

  // The planner asks for its plan; the loading overlay used to, off its CSS transition.
  // Mounting is the honest ask, since nothing here is on screen until a chain reports
  // back — and a transition fires on a schedule the store cannot reason about.
  onMounted(() => eventBus.emit('readyForData'))

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
    // A factory page is one card, so the sidebar marks that factory however far it is scrolled.
    if (currentFactory.value) {
      activeFactoryId.value = currentFactory.value.id
      return
    }

    // The overview's sections, in document order — so once an entry starts below the line, no
    // later one can span it.
    const activationLine = getActivationLine()
    const entries: string[] = [
      'statistics',
      'factory-summary',
      ...(usesDimensionalDepot.value ? ['dimensional-depot'] : []),
    ]
    for (const entry of entries) {
      const rect = document.getElementById(entry)?.getBoundingClientRect()
      if (!rect) continue
      if (rect.top > activationLine) break
      if (rect.bottom > activationLine) {
        activeFactoryId.value = entry
        return
      }
    }
    // Nothing spans the line — it's sitting in the gap/divider between sections.
    // Stay sticky on the previous entry rather than dropping the highlight.
  }

  // The highlight follows the page as soon as it changes, rather than waiting for a scroll.
  watch(currentFactory, () => updateActiveFactory(), { flush: 'post' })

  // Keeps the sidebar's own scroll position following the scroll-spy indicator: as the
  // highlighted row changes, bring it back into the sidebar's view. `block: 'nearest'`
  // moves only the sidebar's scroll container (its the only scrollable ancestor between
  // the row and the page) and only as far as needed - a row already in view causes no
  // motion at all, so this doesn't fight the user's own scrolling of the sidebar.
  // `flush: 'post'` so the row's `.active-view` class has already been painted by the
  // time this queries for it.
  // Back and forward return to where a jump was made from. Anchored on the scroll-spy's entry,
  // refreshed first because the last scroll event's scan may still be waiting on its frame.
  const router = useRouter()
  const jumpHistory = useJumpHistory({
    container: () => document.querySelector<HTMLElement>('.main-content'),
    anchorId: () => {
      updateActiveFactory()
      return activeFactoryId.value === null ? null : String(activeFactoryId.value)
    },
    // Through the router, forced because the location is unchanged, so its record of where the
    // user is in history stays true for the next real page change.
    push: state => {
      const { path, query, hash } = router.currentRoute.value
      return router.push({ path, query, hash, state, force: true })
    },
    // Back and forward cross pages as well as scroll positions, so each place carries the page it
    // was on and returning to it opens that page first.
    view: () => serialiseView(currentFactory.value?.id ?? OVERVIEW),
    showView: (stored, onShown) => {
      const target = parseView(stored)
      if (target === null) return
      pendingArrival = onShown
      setView(target)
    },
  })
  onMounted(jumpHistory.start)
  onUnmounted(jumpHistory.stop)

  watch(activeFactoryId, () => {
    document.querySelectorAll('.sidebar-content .factory-card.active-view, #navigationDrawer .factory-card.active-view')
      .forEach(el => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, { flush: 'post' })

  const showPlan = () => {
    resyncWorldResources()
    planVisible.value = true

    // Restore the indicator once the cards have had a beat to render.
    setTimeout(updateActiveFactory, 300)

    // If another page (e.g. Parts & Recipes) requested a jump to a factory, honour it once rendered.
    const pendingNav = sessionStorage.getItem('navigateToFactory')
    if (pendingNav) {
      sessionStorage.removeItem('navigateToFactory')
      // Not a jump point: back from here should return to the page the jump was asked from, not
      // to the top of a plan the user never saw.
      setTimeout(() => goToFactory(pendingNav, undefined, undefined, false), 250)
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
    focusFactoryName(factory.id)
  }

  // A fresh card starts with the cursor in its name, ready to type over. Focus is
  // also the one client-local marker of "my card" while a collaborator's identical
  // default-named factory can arrive at any moment.
  const focusFactoryName = (factoryId: number) => {
    const focus = () =>
      document.getElementById(String(factoryId))?.querySelector<HTMLInputElement>('input.factory-name')?.focus()
    if (typeof requestAnimationFrame === 'undefined') focus()
    // The card mounts on the next render; the second frame covers slower mounts.
    else requestAnimationFrame(() => requestAnimationFrame(focus))
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
    calculateFactory(factory, getFactories(), gameData, { ...modes, intent: 'userEdit' })
  }

  const copyFactory = (originalFactory: Factory) => {
    // Make a deep copy of the factory with a new ID, unique against the rest of the plan.
    const before = captureOrder(getFactories())
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
    newFactory.syncStateCustomBuildings = {}
    newFactory.inSync = null

    // The clone inherits the original's exports, but the importers are still buying from
    // the original — leaving them on renders as an export nobody asked for until the flush
    // tears them (and a recalculation of every affected factory) back down.
    newFactory.dependencies = { requests: {}, metrics: {} }

    // Same reasoning as the Game Sync reset above: none of the clone's buildings exist yet.
    resetChecklistState(newFactory)

    // The clone inherits the original's group (structuredClone carried it), so seat it directly
    // after the original. Appending and re-sorting would drop it at the end of that group.
    const originalIndex = getFactories().indexOf(originalFactory)
    getFactories().splice(originalIndex + 1, 0, newFactory)
    getFactories().forEach((entry, index) => {
      entry.displayOrder = index
    })

    // Now call calculateFactories in case the clone's imports cause a deficit
    calculateFactories(getFactories(), gameData)

    // The clone itself is structural, so the engine infers it. Everything the reindex above
    // pushed down is not, and would be taken back off the server without this.
    markReorderedFactories(before, getFactories())

    navigateToFactory(newId)
  }

  const deleteFactory = (factory: Factory) => {
    // Find the index of the factory to delete
    const index = getFactories().findIndex(fac => fac.id === factory.id)

    if (index !== -1) {
      const before = captureOrder(getFactories())
      // Worked out before the factory leaves the order it is measured against.
      const nextView = viewAfterRemoving(factoryOrder.value, factory.id)
      removeFactoryDependants(factory, getFactories())

      getFactories().splice(index, 1) // Remove the factory at the found index
      // Declared, not just inferred: deletes coalescing into one op behind a slow ack
      // must still pass the server's bulk-removal threshold.
      markFactoryRemoved(factory)
      updateWorldRawResources(gameData) // Recalculate the world resources

      // After deleting the factory, loop through all factories and update them as inputs / exports have likely changed.
      calculateFactories(getFactories(), gameData)

      // Regenerate the sort orders
      regenerateSortOrders(getFactories())
      // The removal is structural; the records the reindex shifted up are not.
      markReorderedFactories(before, getFactories())

      if (view.value === factory.id) setView(nextView)
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

  // `subsection` may name a row that isn't on screen (a status chip jumping to the product that
  // owns the problem), so callers pass the section as a fallback rather than the jump silently
  // doing nothing. Several rows can be named at once — a chip reading "3 shortages" is about
  // three of them — in which case the jump lands on the topmost and lights all three.
  const navigateToFactory = (factoryId: number | string, subsection?: string | string[], fallback?: string) =>
    goToFactory(factoryId, subsection, fallback, true)

  // `jumpPoint` leaves the place being left in the browser's history, so back returns to it.
  const goToFactory = (
    factoryId: number | string,
    subsection: string | string[] | undefined,
    fallback: string | undefined,
    jumpPoint: boolean
  ) => {
    const facId = Number.parseInt(factoryId.toString(), 10)
    const factory = findFac(facId, getFactories())
    if (!factory) {
      console.error(`navigateToFactory: Factory ${factoryId} not found!`)
      return
    }
    // Before the page switch and group reveal below, which change the content the place is
    // measured in. The row named first is what forward will light up again; the card when none is
    // named.
    if (jumpPoint) jumpHistory.record([subsection ?? []].flat()[0] ?? `${factoryId}`)

    const switching = currentFactory.value?.id !== facId
    setView(facId)

    // Open the factory's group in the sidebar, so the row the pane now shows is visible there.
    setCollapsed(factory.group?.id ?? null, false)

    const requested = Array.isArray(subsection) ? subsection : subsection ? [subsection] : []

    // The card itself is the last resort behind whatever the caller named: a jump that aims at a
    // row inside a card that has not rendered yet would otherwise land nowhere at all, and being
    // taken to the factory beats being taken nowhere.
    const fallbacks = fallback ? [fallback, `${factoryId}`] : [`${factoryId}`]

    if (switching) {
      // A different factory fades in at the top, or already sitting on the row the jump names.
      // Nothing to scroll to otherwise: the new page is what says the jump happened.
      pendingArrival = requested.length ? () => scrollToElement(requested, fallbacks, 0, [], true) : null
      return
    }

    pendingArrival = null
    // The factory already open: scroll within it, as any jump inside the page does.
    void nextTick(() => setTimeout(() => {
      if (requested.length) scrollToElement(requested, fallbacks)
      else showFactoryTop(facId)
    }, 50))
  }

  // A jump to the factory already open takes it back to the top, where the way back to the
  // previous one is, and pulses the card so the eye finds it.
  const showFactoryTop = (factoryId: number) => {
    document.querySelector<HTMLElement>('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => {
      const card = document.getElementById(String(factoryId))
      if (card) flashElement(card)
    }, 350)
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
  // `instant` is for a page that has just been switched to: it is placed rather than scrolled.
  const scrollToElement = (
    candidates: string | string[],
    fallbacks: string | string[] = [],
    attempt = 0,
    flashed: string[] = [],
    instant = false,
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
      behavior: attempt === 0 && !instant ? 'smooth' : 'auto',
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
    if (attempt === 0 && !instant) setTimeout(flashAll, 350)
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
        scrollToElement(targets, standIns, attempt + 1, [...flashed, ...pending], instant)
      }
    }, 600)
  }

  const moveFactory = (factory: Factory, direction: string) => {
    // The reindex runs over the whole plan; mark exactly the records whose order moved.
    const before = captureOrder(getFactories())
    reorderFactory(factory, direction, getFactories())
    markReorderedFactories(before, getFactories())
  }

  // Scroll to a non-factory section (Statistics, Factories Summary, Dimensional Depot) by its id.
  // The section may be collapsed — tell it to show itself first (each listens for its own
  // id), give the reveal a beat to change the layout, then scroll. scrollToElement's
  // correction passes absorb any further shifts from content still materializing.
  // Right after page load the section components may not be mounted yet, so a single
  // emit can vanish into the void — keep re-emitting until the element exists (bounded).
  const navigateToSection = (sectionId: string, attempt = 0) => {
    if (attempt === 0) {
      jumpHistory.record(sectionId)
      // Every section lives on the overview, which is not on screen while a factory is. Coming
      // from a factory, the overview fades in already on the section rather than scrolling to it.
      if (currentFactory.value) {
        pendingArrival = () => {
          eventBus.emit('openSection', sectionId)
          // A section still revealing itself is not there yet; the usual polling finds it.
          void nextTick(() => document.getElementById(sectionId)
            ? scrollToElement(sectionId, [], 0, [], true)
            : navigateToSection(sectionId, 1))
        }
        setView(OVERVIEW)
        return
      }
      pendingArrival = null
    }
    eventBus.emit('openSection', sectionId)
    if (!document.getElementById(sectionId)) {
      if (attempt < 20) {
        setTimeout(() => navigateToSection(sectionId, attempt + 1), 250)
      }
      return
    }
    setTimeout(() => scrollToElement(sectionId), 50)
  }

  // A dialog cannot call navigateToSection itself, so it asks for the jump by id.
  eventBus.on('jumpToSection', sectionId => navigateToSection(sectionId))

  // Same for the tab bar's search: it sits above the planner in the layout, so it cannot inject
  // navigateToFactory and asks over the bus instead.
  eventBus.on('jumpToFactory', ({ factoryId, targets, fallback }) =>
    navigateToFactory(factoryId, targets, fallback))

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

// A zero-height sticky anchor at the top of the scrolling pane, so the curtain hangs over whatever
// part of the page is in view. Negative insets cover the pane's own pa-3 padding too.
.page-curtain-anchor {
  position: sticky;
  top: 0;
  height: 0;
  z-index: 5;
}

// Shown at once and faded away over PAGE_FADE_MS. Pointer events only while shown, so a click
// mid-switch lands on nothing rather than on the page being swapped out.
.page-curtain {
  position: absolute;
  top: -12px;
  left: -12px;
  right: -12px;
  height: calc(100vh - #{$chrome-height});
  overflow: hidden;
  background: rgb(var(--v-theme-background));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.page-curtain-shown {
  opacity: 1;
  pointer-events: auto;
  transition: none;
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
    position: relative;
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
