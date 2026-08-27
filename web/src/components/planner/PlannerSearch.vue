<!-- Plan-wide search, sitting next to the Options button in the tab bar (#611).
     Finds a factory by name, or a part — listing the factories that touch it, production first.
     The searching itself lives in utils/factory-search.ts; this is the box and the list. -->
<template>
  <v-menu
    v-model="open"
    :close-on-content-click="false"
    location="bottom end"
    max-width="520"
    min-width="340"
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

    <v-card class="search-results">
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
              type="button"
              @click="goToFactory(match.factory.id)"
              @mousemove="activeIndex = indexOf(`factory-${match.factory.id}`)"
            >
              <factory-icon-display :icon="match.factory.icon" size="20" />
              <span class="row-name">{{ match.factory.name }}</span>
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
                type="button"
                @click="goToUsage(part.partId, usage)"
                @mousemove="activeIndex = indexOf(`${part.partId}-${usage.factory.id}`)"
              >
                <factory-icon-display :icon="usage.factory.icon" size="20" />
                <span class="row-name">{{ usage.factory.name }}</span>
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

  const { mdAndUp } = useDisplay()
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
      open.value = false
      return
    }
    if (!open.value && event.key.length === 1) open.value = true
    if (!rows.value.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % rows.value.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeIndex.value = (activeIndex.value - 1 + rows.value.length) % rows.value.length
    } else if (event.key === 'Enter') {
      event.preventDefault()
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
  })
</script>

<style lang="scss" scoped>
.search-activator {
  display: flex;
  align-items: center;
}

.search-field {
  width: 240px;
  // The bar shares a 52px tab bar with buttons that are 36-40px tall; compact density lands it
  // in the middle of them rather than stretching the bar.
  :deep(.v-field) {
    border-radius: 4px;
  }
}

.search-results {
  // The panel is a list of clickable rows, so it must not read as a card of prose.
  background-color: #2a2a2a;
}

.results-scroll {
  max-height: min(60vh, 520px);
  overflow-y: auto;
}

.group-heading {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background-color: #1f1f1f;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #e0e0e0;
  position: sticky;
  top: 0;
  z-index: 1;
}

// Parts wear their own name at full size — it is the thing that was searched for, and shouting
// it in the same small caps as "Factories" made the list read as one long heading.
.part-heading {
  text-transform: none;
  letter-spacing: normal;
  font-size: 0.9rem;

  .count {
    font-size: 0.7rem;
    font-weight: 400;
    color: #9e9e9e;
    text-transform: none;
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
  width: 100%;
  padding: 6px 12px 6px 20px;
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

  .row-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-usage {
    flex: 0 0 auto;
    font-size: 0.75rem;
    color: #bdbdbd;
    white-space: nowrap;
  }
}

.more {
  margin: 0;
  padding: 4px 12px 8px 20px;
  font-size: 0.72rem;
  color: #9e9e9e;
}
</style>
