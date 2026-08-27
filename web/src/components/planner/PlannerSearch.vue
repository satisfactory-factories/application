<!-- Plan-wide search, sitting next to the Options button in the tab bar (#611).
     Finds a factory by name, or a part — listing the factories that touch it, production first.
     The searching itself lives in utils/factory-search.ts; this is the box and the list. -->
<template>
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    location="bottom end"
    :max-width="menuWidth"
    offset="6"
    :open-on-click="false"
  >
    <template #activator="{ props: activatorProps }">
      <!-- Desktop gets the bar itself; below md the tab bar has no room for one, so the same
           search opens from a button with the field at the top of the panel instead.

           The activator is the wrapper rather than the field, and the keys are caught on the way
           down: the field's own input stops keydown from propagating, so a listener anywhere
           above it in the bubble phase never sees the arrow keys the results list is walked with. -->
      <div
        v-if="mdAndUp"
        v-bind="activatorProps"
        class="search-activator"
        @focusin.capture="onFocusIn"
        @focusout.capture="onFocusOut"
        @keydown.capture="onKeydown"
      >
        <v-text-field
          id="planner-search-field"
          v-model="query"
          class="search-field"
          clearable
          density="compact"
          hide-details
          placeholder="Search factories & parts"
          prepend-inner-icon="fas fa-search"
          variant="solo-filled"
          @click="open = true"
        />
      </div>
      <v-btn
        v-else
        id="planner-search-button"
        v-bind="activatorProps"
        color="grey-darken-1 rounded"
        icon="fas fa-search"
        size="small"
        title="Search factories & parts"
        variant="flat"
        @click="open = !open"
      />
    </template>

    <!-- The width is set here rather than on the menu: the connected overlay overrides `min-width`
         with the activator's own width, so a menu-level minimum is quietly ignored. -->
    <v-card
      class="search-results"
      :class="{ focused }"
      :style="{ width: `${menuWidth}px` }"
      @focusin.capture="onFocusIn"
      @focusout.capture="onFocusOut"
    >
      <!-- Caught on the way down for the same reason as the desktop bar above. -->
      <div v-if="!mdAndUp" class="pa-2" @keydown.capture="onKeydown">
        <v-text-field
          id="planner-search-field-compact"
          v-model="query"
          autofocus
          clearable
          density="compact"
          hide-details
          placeholder="Search factories & parts"
          prepend-inner-icon="fas fa-search"
          variant="solo-filled"
        />
      </div>

      <div class="results-scroll">
        <p v-if="!trimmedQuery" class="pa-4 mb-0 text-body-2 text-medium-emphasis">
          Type a factory name, or a part to see every factory that makes, produces as a
          byproduct, or otherwise uses it.
        </p>
        <p v-else-if="!anyResults" class="pa-4 mb-0 text-body-2 text-medium-emphasis">
          Nothing in this plan matches "<b>{{ trimmedQuery }}</b>".
        </p>

        <template v-else>
          <template v-if="results.factories.length">
            <div class="group-heading">
              <i class="fas fa-industry mr-2" />Factories
            </div>
            <button
              v-for="match in results.factories"
              :key="`factory-${match.factory.id}`"
              class="result-row"
              :class="{ active: activeIndex === indexOf(`factory-${match.factory.id}`) }"
              :title="match.factory.group ? `Group: ${match.factory.group.name}` : undefined"
              type="button"
              @click="goToFactory(match.factory.id)"
              @mousemove="activeIndex = indexOf(`factory-${match.factory.id}`)"
            >
              <v-chip
                class="sf-chip sf-chip-clickable small factory no-margin row-chip"
                :class="{ grouped: !!match.factory.group }"
                :style="groupStripe(match.factory)"
              >
                <factory-icon-display :icon="match.factory.icon" size="20" />
                <b class="ml-2 row-name">{{ match.factory.name }}</b>
              </v-chip>
            </button>
            <p v-if="results.hiddenFactories" class="more">
              +{{ results.hiddenFactories }} more factory name{{ results.hiddenFactories === 1 ? '' : 's' }}
            </p>
          </template>

          <template v-for="part in results.parts" :key="part.partId">
            <div class="group-heading part-heading">
              <game-asset height="20" :subject="part.partId" type="item" width="20" />
              <span class="ml-2">{{ part.partName }}</span>
              <v-spacer />
              <span class="count">{{ part.factoryCount }} {{ part.factoryCount === 1 ? 'factory' : 'factories' }}</span>
            </div>
            <template v-for="group in part.groups" :key="`${part.partId}-${group.role}`">
              <div class="role-heading">{{ ROLE_LABEL[group.role] }}</div>
              <button
                v-for="usage in group.usages"
                :key="`${part.partId}-${usage.factory.id}`"
                class="result-row"
                :class="{ active: activeIndex === indexOf(`${part.partId}-${usage.factory.id}`) }"
                :title="usage.factory.group ? `Group: ${usage.factory.group.name}` : undefined"
                type="button"
                @click="goToUsage(part.partId, usage)"
                @mousemove="activeIndex = indexOf(`${part.partId}-${usage.factory.id}`)"
              >
                <v-chip
                  class="sf-chip sf-chip-clickable small factory no-margin row-chip"
                  :class="{ grouped: !!usage.factory.group }"
                  :style="groupStripe(usage.factory)"
                >
                  <factory-icon-display :icon="usage.factory.icon" size="20" />
                  <b class="ml-2 row-name">{{ usage.factory.name }}</b>
                </v-chip>
                <span class="row-usage">
                  {{ USAGE_LABEL[usage.kind] }} {{ formatNumber(usage.amount) }}/min
                </span>
              </button>
              <p v-if="group.hidden" class="more">+{{ group.hidden }} more</p>
            </template>
          </template>

          <p v-if="results.hiddenParts" class="more">
            +{{ results.hiddenParts }} more part{{ results.hiddenParts === 1 ? '' : 's' }} — keep typing to narrow it down
          </p>
        </template>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { useDisplay } from 'vuetify'
  import { useRoute, useRouter } from 'vue-router'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import {
    buildPlanSearchIndex,
    FactorySummary,
    hasResults,
    PartUsageEntry,
    PlanSearchIndex,
    ROLE_LABEL,
    searchPlan,
    USAGE_LABEL,
    usageJumpTarget,
  } from '@/utils/factory-search'
  import { formatNumber } from '@/utils/numberFormatter'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{ factories: Factory[] }>()

  const { mdAndUp, width } = useDisplay()

  // Fixed rather than sized to its contents: wide enough for the factory chips, whose names run
  // long, and stable, so the panel does not jump about under the cursor as the results change
  // between keystrokes. Clamped to the window, which the connected overlay would happily overhang.
  const menuWidth = computed(() => Math.min(560, Math.max(280, width.value - 24)))

  // Whether the search holds focus — the box or anything in the panel below it. Drives the ring
  // that ties the two together: the panel is teleported out to the overlay, so it is nowhere near
  // the box in the DOM and cannot be reached by the box's own :focus-within.
  const focused = ref(false)
  // focusout fires before the focusin that follows it, so moving from the box into the panel
  // reads as a blur for one frame. Deferring the drop and cancelling it on the next focusin keeps
  // the ring steady across that hop.
  let blurTimer: ReturnType<typeof setTimeout> | undefined
  const onFocusIn = () => {
    clearTimeout(blurTimer)
    focused.value = true
  }
  const onFocusOut = () => {
    clearTimeout(blurTimer)
    blurTimer = setTimeout(() => {
      focused.value = false
    })
  }
  const route = useRoute()
  const router = useRouter()

  const open = ref(false)
  const query = ref('')
  // Typing lands instantly; the search runs a beat behind it. Even indexed, a plan of a few
  // hundred parts is not free, and a keystroke is not a question.
  const debouncedQuery = ref('')
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  watch(query, value => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedQuery.value = value ?? ''
    }, 150)
    // A cleared box is answered at once — waiting to empty a list looks like a stuck UI.
    if (!value) debouncedQuery.value = ''
  })

  const trimmedQuery = computed(() => debouncedQuery.value.trim())

  const EMPTY_INDEX: PlanSearchIndex = { factories: [], parts: [], usages: new Map() }

  // Reading the plan is what makes this expensive, so it is only read while the panel is actually
  // open: with `open` false the computed short-circuits before touching `factories` at all, which
  // means it never subscribes to them and a plan being edited elsewhere cannot invalidate it.
  const index = computed<PlanSearchIndex>(() =>
    open.value ? buildPlanSearchIndex(props.factories) : EMPTY_INDEX)

  const results = computed(() => searchPlan(trimmedQuery.value, index.value))
  const anyResults = computed(() => hasResults(results.value))

  // The rows in the order they are rendered, so the arrow keys can walk them. Keyed by the same
  // strings the template uses, which is how a row knows whether it is the highlighted one.
  const rows = computed(() => {
    const keys: { key: string, activate: () => void }[] = []

    results.value.factories.forEach(match => keys.push({
      key: `factory-${match.factory.id}`,
      activate: () => goToFactory(match.factory.id),
    }))
    results.value.parts.forEach(part => part.groups.forEach(group => group.usages.forEach(usage => {
      keys.push({
        key: `${part.partId}-${usage.factory.id}`,
        activate: () => goToUsage(part.partId, usage),
      })
    })))

    return keys
  })

  const activeIndex = ref(0)
  // Every row asks where it sits on every render, so this is a lookup rather than a scan.
  const rowIndex = computed(() => new Map(rows.value.map((row, position) => [row.key, position])))
  const indexOf = (key: string) => rowIndex.value.get(key) ?? -1

  // A new result set invalidates wherever the highlight was.
  watch(rows, () => {
    activeIndex.value = 0
  })

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      // Stopped like the rest below: left to travel on, it reaches the menu, which closes itself
      // AND hands focus back to the activator, undoing the caret position the user was typing at.
      event.stopPropagation()
      open.value = false
      return
    }
    if (!open.value && event.key.length === 1) open.value = true
    if (!rows.value.length) return
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return

    // Caught on the way down and stopped here. VMenu answers ArrowDown on its activator by moving
    // focus into the panel and onto the first row — which is a reasonable thing for a menu to do
    // and exactly wrong for a search box: the caret leaves the box the user is still typing in,
    // and every keystroke after the first arrow lands on a button instead. Only these three keys
    // are stopped; everything else has to reach the input, which is the whole point of the box.
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'ArrowDown') {
      activeIndex.value = (activeIndex.value + 1) % rows.value.length
    } else if (event.key === 'ArrowUp') {
      activeIndex.value = (activeIndex.value - 1 + rows.value.length) % rows.value.length
    } else {
      rows.value[activeIndex.value]?.activate()
    }
  }

  const jump = (factoryId: number, targets: string[] = [], fallback?: string) => {
    open.value = false

    // The tab bar is also up on the graph page, where there is no planner listening and nothing
    // to scroll. Hand the jump to the planner the way the Parts page does and go there.
    if (route.path !== '/') {
      sessionStorage.setItem('navigateToFactory', String(factoryId))
      router.push('/')
      return
    }

    eventBus.emit('jumpToFactory', { factoryId, targets, fallback })
  }

  // The group's colour, handed to the chip's own left edge as a custom property. A property rather
  // than the border directly because `.sf-chip.factory` sets its border colour with `!important`,
  // which a plain inline style loses to; the rule that reads this can carry its own.
  //
  // Ungrouped factories get nothing rather than a grey stand-in: a colour that means "no group"
  // still reads as a group at a glance.
  const groupStripe = (factory: FactorySummary) =>
    factory.group ? { '--group-color': factory.group.color } : undefined

  const goToFactory = (factoryId: number) => jump(factoryId)

  const goToUsage = (partId: string, usage: PartUsageEntry) => {
    const { targets, fallback } = usageJumpTarget(partId, usage)
    jump(usage.factory.id, targets, fallback)
  }

  // Ctrl/Cmd+K from anywhere in the planner, the shortcut every other search box in the world uses.
  const onShortcut = (event: KeyboardEvent) => {
    if (event.key?.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    open.value = true
    // The desktop field is the activator and not inside the panel, so it has to be focused by hand.
    setTimeout(() => document.getElementById('planner-search-field')?.focus(), 50)
  }

  onMounted(() => window.addEventListener('keydown', onShortcut))
  onUnmounted(() => {
    window.removeEventListener('keydown', onShortcut)
    clearTimeout(debounceTimer)
    clearTimeout(blurTimer)
  })
</script>

<style lang="scss" scoped>
.search-activator {
  display: flex;
  align-items: center;
}

// The ring the box and its panel share while the search holds focus. Neutral grey rather than a
// colour from the palette: every colour in here means something (orange is power draw, red a
// problem), and a ring that only says "you are typing" should not borrow one of them. A hairline
// in the same quiet grey the chips are bordered with — it only has to tie the panel to the box it
// dropped out of, and anything heavier competes with the results for attention.
$focus-ring: 1px solid var(--sf-grey-border);

.search-field {
  width: 240px;
  // The bar shares a 52px tab bar with buttons that are 36-40px tall; compact density lands it
  // in the middle of them rather than stretching the bar.
  :deep(.v-field) {
    border-radius: 4px;
    // An outline rather than a border: the field is 40px in a 52px bar, and a border would grow it.
    outline: 1px solid transparent;
    transition: outline-color 0.15s;
  }
}

.search-activator:focus-within .search-field :deep(.v-field) {
  outline: $focus-ring;
}

.search-results {
  // The panel is a list of clickable rows, so it must not read as a card of prose.
  background-color: #2a2a2a;
  // Lifts the panel off the plan it covers — without it the list reads as part of the page it is
  // floating over, which at this width is most of the first factory card.
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6) !important;
  outline: 1px solid transparent;
  transition: outline-color 0.15s;

  &.focused {
    outline: $focus-ring;
  }
}

.results-scroll {
  max-height: min(60vh, 520px);
  overflow-y: auto;
}

// One style for every section heading. "Factories" and "Copper Ore" name the same tier of thing —
// what the rows under them are about — so they are set the same: the parts used to be a size
// larger and in mixed case while "Factories" was small caps, and the two read as unrelated.
.group-heading {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background-color: #1f1f1f;
  font-size: 0.9rem;
  font-weight: 700;
  color: #e0e0e0;
  position: sticky;
  top: 0;
  z-index: 1;

  .count {
    font-size: 0.7rem;
    font-weight: 400;
    color: #9e9e9e;
  }
}

.role-heading {
  padding: 4px 12px 2px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sf-power-consumption);
}

.result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  // Barely indented: the chip is already a bounded shape, so a deep indent under the heading only
  // pushed it away from the left edge without grouping it with anything.
  width: 100%;
  padding: 6px 12px 6px 10px;
  text-align: left;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover,
  &.active {
    background-color: rgba(255, 255, 255, 0.10);
  }

  // The factory chip is the same one the summary rows, import links and export requests wear, so a
  // result reads as a factory before it is read at all. It gives up width before the rate on its
  // right does: a long name truncating is a smaller loss than the number it is being listed for.
  .row-chip {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;

    // The group's colour on the chip's own left edge rather than out at the row's, where it read
    // as a bar floating beside the result instead of as something the factory carries. Both
    // declarations need !important to get past `.sf-chip.factory`, which sets the border with it.
    &.grouped {
      border-left-color: var(--group-color) !important;
      border-left-width: 5px !important;
    }

    :deep(.v-chip__content) {
      min-width: 0;
      overflow: hidden;
    }
  }

  .row-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-usage {
    flex: 0 0 auto;
    margin-left: auto;
    font-size: 0.75rem;
    color: #bdbdbd;
    white-space: nowrap;
  }
}

.more {
  margin: 0;
  padding: 4px 12px 8px 10px;
  font-size: 0.72rem;
  color: #9e9e9e;
}
</style>
