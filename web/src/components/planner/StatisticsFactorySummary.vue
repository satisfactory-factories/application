<template>
  <!-- The fullscreen view. Its table is its own instance of the same component the section below
       renders, built when it opens and thrown away when it closes, so the two share their markup
       without sharing any state. Nothing here can reach the section in the planner. -->
  <!-- Rows are held back until `after-enter`, so the panel animates in showing stand-in rows and
       only then does the expensive build happen. Two frames was not enough on a large plan: the
       build landed inside the opening animation and froze the panel half-way up. -->
  <v-dialog
    v-model="expanded"
    fullscreen
    transition="dialog-bottom-transition"
    @after-enter="dialogOpened = true"
    @after-leave="onDialogClosed"
  >
    <v-card class="factory-card rounded-0">
      <v-row class="header flex-grow-0">
        <v-col class="text-h4 d-flex align-center flex-wrap ga-3" cols="12" lg="9" md="8">
          <!-- Named for what it is showing, so a group's breakdown and the whole plan's cannot be
               mistaken for each other. -->
          <span class="d-flex align-center">
            <i class="fas fa-list" />
            <span class="ml-3">{{ groupFilter ? 'Group Factories Summary' : 'Global Factories Summary' }}</span>
          </span>
          <!-- The count belongs with the title. The state of the plan is its own group, so a
               narrow planner drops all three status chips to a second line together rather than
               peeling them off one at a time. Gaps come from the containers: `no-margin` is an
               !important rule, so an ml-* utility on a chip does nothing. -->
          <v-chip
            v-if="dialogFactories.length > 0"
            class="sf-chip sf-chip-info factory small no-margin"
            variant="tonal"
          >
            <i class="fas fa-industry" />
            <span class="ml-2">{{ dialogFactories.length }} {{ dialogFactories.length === 1 ? 'factory' : 'factories' }}</span>
          </v-chip>
          <!-- Opened from a sidebar group. Says which one, and clears back to the whole plan. -->
          <v-chip
            v-if="groupFilter"
            class="sf-chip small no-margin sf-chip-clickable factory"
            title="Showing one group. Click to show the whole plan"
            variant="flat"
            @click="groupFilter = null"
          >
            <i class="fas fa-folder" />
            <span class="mx-2">{{ groupFilterName }}</span>
            <i class="fas fa-times" />
          </v-chip>
          <!-- In the header rather than the body, so a collapsed summary still says how the plan
               is doing. Only what applies is shown. -->
          <div v-if="dialogTally.length" class="d-flex align-center flex-wrap ga-2">
            <v-chip
              v-for="chip in dialogTally"
              :key="chip.key"
              class="sf-chip small no-margin sf-chip-clickable"
              :class="[chip.class, { 'filter-on': dialogStatusFilter === chip.key }]"
              :title="dialogStatusFilter === chip.key ? 'Showing only these. Click to clear' : `Show only the ${chip.label}`"
              :variant="dialogStatusFilter === chip.key ? 'flat' : 'tonal'"
              @click.stop="toggleDialogStatusFilter(chip.key)"
            >
              <i :class="chip.icon" />
              <span class="ml-2">{{ chip.count }} {{ chip.label }}</span>
            </v-chip>
          </div>
        </v-col>
        <v-col class="text-right" cols="12" lg="3" md="4">
          <v-btn
            color="primary"
            prepend-icon="fas fa-compress-alt"
            variant="outlined"
            @click="expanded = false"
          >Close
          </v-btn>
        </v-col>
      </v-row>
      <v-card-text class="pa-4">
        <!-- Opened from a group, so lead with what the group makes before the factories that make
             it. Routing and faults are deliberately not the same shape: what the group delivers is
             a table you read across, and a part nothing wants is called out in amber. -->
        <div v-if="groupFilter" class="group-rollup mb-4">
          <div v-if="exportedProducts.length" class="rollup-section">
            <h4 class="d-flex align-center ga-2 mb-2">
              <i :class="groupProductKinds.export.icon" />
              <span>{{ groupProductKinds.export.heading }}</span>
            </h4>
            <v-table class="rounded border-md sub-card rollup-table" density="compact">
              <thead>
                <tr>
                  <th class="text-left" scope="row">Part</th>
                  <th class="text-left" scope="row">Exported</th>
                  <th class="text-left" scope="row">To</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="product in exportedProducts" :key="product.partId">
                  <td>
                    <span class="d-flex align-center ga-3">
                      <group-product-icon
                        kind="export"
                        :part-id="product.partId"
                        :size="30"
                        :tooltip="getPartDisplayName(product.partId)"
                      />
                      <span>{{ getPartDisplayName(product.partId) }}</span>
                    </span>
                  </td>
                  <td>
                    <b>{{ formatNumber(exportedTotal(product.partId)) }}/min</b>
                    <span class="rollup-net d-block" :class="rollupNetClass(product.net)">
                      {{ rollupNetText(product.net) }}
                    </span>
                  </td>
                  <td>
                    <!-- Named the way the summary's own Exports column names them, so the same
                         destination reads the same in both places. -->
                    <v-chip
                      v-for="flow in exportsFor(product.partId)"
                      :key="`${product.partId}-to-${flow.factoryId}`"
                      class="sf-chip factory flow-factory small"
                      @click="goToFactoryFromDialog(flow.factoryId)"
                    >
                      <factory-icon-display :icon="factoryIcon(flow.factoryId)" size="18" />
                      <span class="ml-2">{{ factoryName(flow.factoryId) }}</span>
                      <span class="ml-2 text-medium-emphasis">{{ formatNumber(flow.amount) }}/min</span>
                    </v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <div v-if="noDemandProducts.length" class="rollup-section">
            <h4 class="no-demand-heading d-flex align-center ga-2 mb-2">
              <i :class="groupProductKinds.product.icon" />
              <span>{{ groupProductKinds.product.heading }}</span>
            </h4>
            <v-table class="rounded border-md sub-card rollup-table no-demand" density="compact">
              <thead>
                <tr>
                  <th class="text-left" scope="row">Part</th>
                  <th class="text-left" scope="row">Made</th>
                  <th class="text-left" scope="row">By</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="product in noDemandProducts" :key="product.partId">
                  <td>
                    <span class="d-flex align-center ga-3">
                      <group-product-icon
                        kind="product"
                        :part-id="product.partId"
                        :size="30"
                        :tooltip="getPartDisplayName(product.partId)"
                      />
                      <span>{{ getPartDisplayName(product.partId) }}</span>
                    </span>
                  </td>
                  <td><b>{{ formatNumber(producedTotal(product.partId)) }}/min</b></td>
                  <td>
                    <!-- The factory to go and look at, which is the only actionable part of this. -->
                    <v-chip
                      v-for="flow in producersFor(product.partId)"
                      :key="`${product.partId}-by-${flow.factoryId}`"
                      class="sf-chip factory flow-factory small"
                      @click="goToFactoryFromDialog(flow.factoryId)"
                    >
                      <factory-icon-display :icon="factoryIcon(flow.factoryId)" size="18" />
                      <span class="ml-2">{{ factoryName(flow.factoryId) }}</span>
                      <span class="ml-2 text-medium-emphasis">{{ formatNumber(flow.amount) }}/min</span>
                    </v-chip>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>

          <!-- Collapsed by default: an intermediate that never leaves the group says nothing about
               what the group delivers, which is the same reason the sidebar row hides these. -->
          <div v-if="internalProducts.length" class="rollup-section">
            <h4
              class="rollup-toggle d-flex align-center ga-2 mb-2"
              role="button"
              tabindex="0"
              @click="internalOpen = !internalOpen"
              @keydown.enter.prevent="internalOpen = !internalOpen"
              @keydown.space.prevent="internalOpen = !internalOpen"
            >
              <span v-if="internalOpen" key="open"><i class="fas fa-chevron-down" /></span>
              <span v-else key="shut"><i class="fas fa-chevron-right" /></span>
              <i :class="groupProductKinds.internal.icon" />
              <span>{{ groupProductKinds.internal.heading }}</span>
              <span class="text-medium-emphasis">({{ internalProducts.length }})</span>
            </h4>
            <div v-if="internalOpen" class="d-flex flex-wrap ga-4 pl-1">
              <span
                v-for="product in internalProducts"
                :key="product.partId"
                class="rollup-tile d-flex align-center ga-3"
              >
                <group-product-icon
                  kind="internal"
                  :part-id="product.partId"
                  :tooltip="getPartDisplayName(product.partId)"
                />
                <span>
                  <span class="d-block">{{ getPartDisplayName(product.partId) }}</span>
                  <span class="rollup-net d-block" :class="rollupNetClass(product.net)">
                    {{ rollupNetText(product.net) }}
                  </span>
                </span>
              </span>
            </div>
          </div>
        </div>
        <!-- v-if, not v-show: the rows are the expensive part, so the fullscreen table exists only
             while it is on screen. Closing throws it away and the section below is untouched. -->
        <p v-if="!dialogOpened" class="building-note mb-3">
          <v-progress-circular class="mr-2" indeterminate size="18" width="2" />
          Building the table for
          {{ dialogFactories.length }} {{ dialogFactories.length === 1 ? 'factory' : 'factories' }}
        </p>
        <factory-summary-table
          v-if="expanded"
          :all-factories="factories"
          :enabled="dialogOpened"
          height="calc(100vh - 140px)"
          :rows="dialogRows"
          skeleton-id="factory-summary-dialog-skeleton"
          :statuses="statuses"
          @navigate="goToFactoryFromDialog"
        />
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-row id="factory-summary" class="mb-4">
    <v-col>
      <v-card class="factory-card">
        <v-row class="header">
          <v-col class="text-h4 d-flex align-center flex-wrap ga-3" cols="12" lg="9" md="8">
            <span class="d-flex align-center">
              <i class="fas fa-list" /><span class="ml-3">Global Factories Summary</span>
            </span>
            <v-chip
              v-if="factories.length > 0"
              id="factory-summary-count"
              class="sf-chip sf-chip-info factory small no-margin"
              variant="tonal"
            >
              <i class="fas fa-industry" />
              <span class="ml-2">{{ factories.length }} {{ factories.length === 1 ? 'factory' : 'factories' }}</span>
            </v-chip>
            <div v-if="statusTally.length" class="d-flex align-center flex-wrap ga-2">
              <v-chip
                v-for="chip in statusTally"
                :key="chip.key"
                class="sf-chip small no-margin sf-chip-clickable"
                :class="[chip.class, { 'filter-on': statusFilter === chip.key }]"
                :title="statusFilter === chip.key ? 'Showing only these. Click to clear' : `Show only the ${chip.label}`"
                :variant="statusFilter === chip.key ? 'flat' : 'tonal'"
                @click.stop="toggleStatusFilter(chip.key)"
              >
                <i :class="chip.icon" />
                <span class="ml-2">{{ chip.count }} {{ chip.label }}</span>
              </v-chip>
            </div>
          </v-col>
          <v-col class="text-right" cols="12" lg="3" md="4">
            <v-btn
              v-show="!hidden"
              class="mr-2"
              color="primary"
              prepend-icon="fas fa-expand-alt"
              variant="outlined"
              @click="openFullscreen()"
            >Expand
            </v-btn>
            <v-btn
              v-show="!hidden"
              color="primary"
              prepend-icon="fas fa-eye-slash"
              variant="flat"
              @click="toggleVisibility"
            >Hide
            </v-btn>
            <v-btn
              v-show="hidden"
              color="primary"
              prepend-icon="fas fa-eye"
              variant="outlined"
              @click="toggleVisibility"
            >Show
            </v-btn>
          </v-col>
        </v-row>
        <v-card-text v-if="!hidden" class="text-body-1">
          <!-- The counts in the header double as filters. Said out loud because a chip that is
               also a button looks exactly like a chip that is not. -->
          <p v-if="statusTally.length" class="filter-hint mb-4">
            <template v-if="statusFilter">
              <i class="fas fa-filter" />
              Showing the <b>{{ visibleFactories.length }}</b>
              {{ visibleFactories.length === 1 ? 'factory' : 'factories' }} behind
              <b>{{ activeFilterLabel }}</b>.
              <v-btn
                class="ml-2"
                density="comfortable"
                prepend-icon="fas fa-times"
                size="small"
                variant="outlined"
                @click="statusFilter = null"
              >Clear</v-btn>
            </template>
            <template v-else>
              <i class="fas fa-filter" /> Click a status count above to list only the factories
              behind it.
            </template>
          </p>

          <!-- Its own instance, never shared with the dialog above. This section renders the
               whole plan and only re-renders when the plan or its own filter changes. -->
          <factory-summary-table
            :all-factories="factories"
            :height="tableHeight"
            :rows="visibleFactories"
            skeleton-id="factory-summary-skeleton"
            :statuses="statuses"
            @measured="onMeasured"
            @navigate="navigateToFactory"
          />
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import {
    FactoryStatusTallyChip,
    factoryStatusTallyChips,
    getFactoryStatuses,
    matchesTallyChip,
    tallyFactoryStatuses,
  } from '@/utils/factory-management/status'
  import {
    collectGroupProducts,
    groupExportRequests,
    groupProducers,
    GroupProductFlow,
    GroupProductKind,
    groupProductKinds,
  } from '@/utils/factory-management/group-products'
  import GroupProductIcon from '@/components/planner/groups/GroupProductIcon.vue'
  import FactorySummaryTable from '@/components/planner/FactorySummaryTable.vue'
  import { UNGROUPED_ID } from '@/utils/factory-management/factory-groups'
  import eventBus from '@/utils/eventBus'

  // Matches the sidebar row's threshold, so a figure it calls balanced is not a surplus here.
  const ROLLUP_EPSILON = 0.001

  const sumAmounts = (flows: GroupProductFlow[]) =>
    flows.reduce((total, flow) => total + flow.amount, 0)

  /**
   * Caches a per-part lookup for as long as the group being shown does not change.
   *
   * Both lookups walk every member factory's requests, and the template asks for each one twice per
   * row (once for the total, once for the list). Without this, a group of 11 factories re-walked
   * them on every render of every row.
   */
  const memoPerPart = (lookup: (partId: string) => GroupProductFlow[]) => {
    let cache = new Map<string, GroupProductFlow[]>()
    let cachedFor: unknown = null
    return (partId: string): GroupProductFlow[] => {
      if (cachedFor !== dialogFactories.value) {
        cache = new Map()
        cachedFor = dialogFactories.value
      }
      if (!cache.has(partId)) cache.set(partId, lookup(partId))
      return cache.get(partId) as GroupProductFlow[]
    }
  }

  const navigateToFactory = inject('navigateToFactory') as (
    id: string | number, subsection?: string | string[], fallback?: string
  ) => void

  const props = defineProps<{
    factories: Factory[];
  }>()

  /**
   * Two views, two independent states.
   *
   * The section in the planner shows the whole plan; the fullscreen dialog shows whatever was asked
   * for, which may be one group. They share the table component and nothing else. Previously they
   * shared one table moved by <Teleport> and therefore shared every filter with it, so opening a
   * group's breakdown re-filtered the planner's section and closing it made that section rebuild
   * every row.
   */
  const hidden = ref<boolean>(localStorage.getItem('summaryHidden') !== 'false')
  const expanded = ref<boolean>(false)
  // Whether the fullscreen panel has finished animating in. Its rows wait for this.
  const dialogOpened = ref<boolean>(false)

  watch(hidden, value => {
    localStorage.setItem('summaryHidden', value.toString())
  })

  const toggleVisibility = () => {
    hidden.value = !hidden.value
  }

  // One pass over the plan, indexed per row — same reason as the sidebar's memo. Shared by both
  // views, because it describes the plan rather than either view of it.
  const statuses = computed(() => new Map(
    props.factories.map(factory => [factory.id, getFactoryStatuses(factory)]),
  ))

  // --- The planner's own section -------------------------------------------------------------

  const headerHeight = 56
  const maxHeight = 750
  const tableHeight = ref<string | undefined>(undefined)

  // The table measures its own rows and hands back the height; capping it here is what makes it
  // scroll internally rather than run the page off the bottom.
  const onMeasured = (contentHeight: number) => {
    tableHeight.value = `${Math.min(contentHeight + headerHeight, maxHeight)}px`
  }

  const statusTally = computed(() => factoryStatusTallyChips(tallyFactoryStatuses(statuses.value.values())))

  const statusFilter = ref<string | null>(null)
  const dialogStatusFilter = ref<string | null>(null)

  // A filter must not survive the thing it filtered on being fixed.
  const clearStaleFilter = (filter: typeof statusFilter, chips: FactoryStatusTallyChip[]) => {
    if (filter.value && !chips.some(chip => chip.key === filter.value)) filter.value = null
  }
  watch(statusTally, chips => clearStaleFilter(statusFilter, chips))

  const toggleStatusFilter = (key: string) => {
    statusFilter.value = statusFilter.value === key ? null : key
  }

  const activeFilterLabel = computed(() =>
    statusTally.value.find(chip => chip.key === statusFilter.value)?.label ?? ''
  )

  const matching = (list: Factory[], key: string | null) => key
    ? list.filter(factory => matchesTallyChip(statuses.value.get(factory.id) ?? [], key))
    : list

  const visibleFactories = computed(() => matching(props.factories, statusFilter.value))

  // --- The fullscreen dialog ------------------------------------------------------------------

  // Set when a sidebar group opens this. Null means the whole plan, which is what the plain Expand
  // button does.
  const groupFilter = ref<string | null>(null)

  const dialogFactories = computed(() => {
    if (!groupFilter.value) return props.factories
    // The Ungrouped section is synthesised and its factories carry no group, so it filters on the
    // absence of one rather than on an id.
    if (groupFilter.value === UNGROUPED_ID) return props.factories.filter(factory => !factory.group)
    return props.factories.filter(factory => factory.group?.id === groupFilter.value)
  })

  const dialogRows = computed(() => matching(dialogFactories.value, dialogStatusFilter.value))

  const dialogTally = computed(() => factoryStatusTallyChips(tallyFactoryStatuses(
    dialogFactories.value.map(factory => statuses.value.get(factory.id) ?? [])
  )))

  watch(dialogTally, chips => clearStaleFilter(dialogStatusFilter, chips))

  const toggleDialogStatusFilter = (key: string) => {
    dialogStatusFilter.value = dialogStatusFilter.value === key ? null : key
  }

  const groupFilterName = computed(() => groupFilter.value === UNGROUPED_ID
    ? 'Ungrouped'
    : dialogFactories.value[0]?.group?.name ?? 'this group')

  /**
   * The sidebar's Factories Summary entry opens the whole plan; a group's expand button passes its
   * id and gets the same table narrowed to it.
   *
   * Note it no longer touches `hidden`. It used to have to: the table lived in the section below and
   * the teleport had nowhere to move it from while that section was collapsed. Opening a group's
   * breakdown therefore un-hid the planner's summary behind it, which nobody asked for.
   */
  // The one way in, so the Expand button and the sidebar cannot forget to reset the gate. Without
  // `dialogOpened` back to false, a second opening builds its rows inside the animation again.
  const openFullscreen = (groupId: string | null = null) => {
    groupFilter.value = groupId
    dialogStatusFilter.value = null
    dialogOpened.value = false
    expanded.value = true
  }

  eventBus.on('openSummaryFullscreen', groupId => openFullscreen(groupId ?? null))

  // Reset once it is off screen, so nothing changes visibly while it animates out.
  const onDialogClosed = () => {
    groupFilter.value = null
    dialogStatusFilter.value = null
    dialogOpened.value = false
  }

  // Sidebar jump-link: landing on a collapsed section just to click Show is pointless, so reveal it
  // before the scroll arrives.
  eventBus.on('openSection', sectionId => {
    if (sectionId === 'factory-summary') {
      hidden.value = false
    }
  })

  // Navigating from the fullscreen view has to dismiss it first, since the scroll target is in the
  // main content behind it. Wait out the close transition too: scrolling while the dialog's
  // scroll-lock is still active aims at a shifting layout.
  const goToFactoryFromDialog = (factoryId: number, subsection?: string | string[], fallback?: string) => {
    expanded.value = false
    setTimeout(() => navigateToFactory(factoryId, subsection, fallback), 400)
  }

  // --- The group roll-up, above the dialog's table ---------------------------------------------

  // Split by role rather than listed together: the two tables answer different questions, and
  // "nothing wants this" is a fault rather than another destination.
  const rollupProducts = computed(() =>
    groupFilter.value ? collectGroupProducts(dialogFactories.value) : [])

  const ofKind = (kind: GroupProductKind) =>
    computed(() => rollupProducts.value.filter(product => product.kind === kind))

  const exportedProducts = ofKind('export')
  const noDemandProducts = ofKind('product')
  const internalProducts = ofKind('internal')

  // Off by default, and remembered for the session only: it is a detail you open when you want it.
  const internalOpen = ref(false)

  // Memoised per part: the template asks for the same list twice (the total and the rows), and both
  // walk every member's requests.
  const exportsFor = memoPerPart(partId => groupExportRequests(dialogFactories.value, partId))
  const producersFor = memoPerPart(partId => groupProducers(dialogFactories.value, partId))

  const exportedTotal = (partId: string) => sumAmounts(exportsFor(partId))
  const producedTotal = (partId: string) => sumAmounts(producersFor(partId))

  const factoryName = (factoryId: number) =>
    props.factories.find(factory => factory.id === factoryId)?.name ?? 'UNKNOWN'

  const factoryIcon = (factoryId: number) =>
    props.factories.find(factory => factory.id === factoryId)?.icon

  // Spelled out rather than the sidebar's four-character figure: there is room for it here, and that
  // row only gets away with dropping the sign because its tooltip says which way it went.
  const rollupNetClass = (net: number) => {
    if (net > ROLLUP_EPSILON) return 'surplus'
    return net < -ROLLUP_EPSILON ? 'deficit' : 'balanced'
  }

  const rollupNetText = (net: number) => {
    if (Math.abs(net) <= ROLLUP_EPSILON) return 'Balanced'
    return net > 0 ? `${formatNumber(net)}/min spare` : `${formatNumber(Math.abs(net))}/min short`
  }
</script>

<style lang="scss" scoped>
.filter-hint {
  color: #bdbdbd;
  font-size: 0.95rem;
}

.building-note {
  display: flex;
  align-items: center;
  color: #bdbdbd;
  font-size: 0.95rem;
}

// The selected count reads as pressed: filled rather than tonal, with a ring so it still stands
// out against the header's own background.
.filter-on {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.65);
}

// The note tier carries no fill of its own, deliberately: a filled note chip would read like the
// two tiers that actually colour a factory. But `flat` here means "this filter is on", and
// Vuetify fills a chip with no colour prop in grey - so a pressed No demand or Potential blockage
// lost its tier entirely and looked like neither. Only the pressed state gets the fill.
.filter-on.status-note {
  color: var(--sf-status-note) !important;
  background-color: var(--sf-status-note-bg) !important;
}

.group-rollup {
  .rollup-section + .rollup-section {
    margin-top: 16px;
  }

  h4 {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #bdbdbd;
  }

  // The badges hang off the icon's bottom right corner, so the tiles need room below and between
  // them or the badge of one sits on the name of the next.
  .rollup-tile {
    min-width: 200px;
    padding-bottom: 4px;
    font-size: 0.95rem;
  }

  // Amber rather than red, matching the tier the `noDemand` status already sits in: an output
  // nothing wants is very often deliberate, so it is a judgement rather than broken arithmetic.
  .no-demand-heading {
    color: var(--sf-status-warning);
  }

  .rollup-toggle {
    cursor: pointer;
    user-select: none;

    &:hover {
      color: #ffffff;
    }
  }

  .rollup-table {
    max-width: 900px;

    :deep(td) {
      // The badge on a 30px icon needs the row to breathe, and the destination cell stacks.
      padding-top: 6px !important;
      padding-bottom: 6px !important;
      height: auto !important;
    }

    :deep(th) {
      white-space: nowrap;
    }

    &.no-demand :deep(td) {
      background-color: var(--sf-status-warning-bg);
    }

    // Each factory reference is the app's factory chip, the same as the summary table's import and
    // export cells use, rather than a bare line of text.
    .flow-factory {
      cursor: pointer;

      &:hover {
        background-color: rgba(255, 255, 255, 0.15);
      }
    }
  }

  .rollup-net {
    font-size: 0.8rem;
    font-weight: 700;

    &.surplus {
      color: var(--sf-success);
    }

    &.deficit {
      color: var(--sf-problem);
    }

    &.balanced {
      color: #9e9e9e;
    }
  }
}
</style>
