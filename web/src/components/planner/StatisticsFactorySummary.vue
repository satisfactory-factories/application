<template>
  <!-- Fullscreen home for the summary table. Declared BEFORE the summary card
       and eager, so the teleport target is mounted by the time the table's
       <Teleport> below resolves it — Vue caches the target at mount even when
       the teleport starts disabled. -->
  <v-dialog v-model="expanded" eager fullscreen transition="dialog-bottom-transition">
    <v-card class="factory-card rounded-0">
      <v-row class="header flex-grow-0">
        <v-col class="text-h4 d-flex align-center flex-wrap ga-3" cols="12" lg="9" md="8">
          <span class="d-flex align-center"><i class="fas fa-list" /><span class="ml-3">Factories Summary</span></span>
          <!-- The count belongs with the title. The state of the plan is its own group, so a
               narrow planner drops all three status chips to a second line together rather than
               peeling them off one at a time. Gaps come from the containers: `no-margin` is an
               !important rule, so an ml-* utility on a chip does nothing. -->
          <v-chip
            v-if="factories.length > 0"
            class="sf-chip sf-chip-info factory small no-margin"
            variant="tonal"
          >
            <i class="fas fa-industry" />
            <span class="ml-2">{{ factories.length }} {{ factories.length === 1 ? 'factory' : 'factories' }}</span>
          </v-chip>
          <!-- In the header rather than the body, so a collapsed summary still says how the plan
               is doing. Only what applies is shown. -->
          <div v-if="statusTally.length" class="d-flex align-center flex-wrap ga-2">
            <v-chip
              v-for="chip in statusTally"
              :key="chip.key"
              class="sf-chip small no-margin sf-chip-clickable"
              :class="[chip.class, { 'filter-on': statusFilter === chip.key }]"
              :title="statusFilter === chip.key ? 'Showing only these — click to clear' : `Show only the ${chip.label}`"
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
            color="primary"
            prepend-icon="fas fa-compress-alt"
            variant="outlined"
            @click="expanded = false"
          >Close
          </v-btn>
        </v-col>
      </v-row>
      <v-card-text class="pa-4">
        <div id="factory-summary-fullscreen-target" />
      </v-card-text>
    </v-card>
  </v-dialog>

  <v-row id="factory-summary" class="mb-4">
    <v-col>
      <v-card class="factory-card">
        <v-row class="header">
          <v-col class="text-h4 d-flex align-center flex-wrap ga-3" cols="12" lg="9" md="8">
            <span class="d-flex align-center"><i class="fas fa-list" /><span class="ml-3">Factories Summary</span></span>
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
                :title="statusFilter === chip.key ? 'Showing only these — click to clear' : `Show only the ${chip.label}`"
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
              @click="expanded = true"
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
          <p v-show="helpText" class="mb-4">
            <i class="fas fa-info-circle" /> Showing an at-a-glance overview of each factory.
            Hover over a chip for the full details.
          </p>

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

          <!-- The table itself is teleported into the fullscreen dialog while
               it's open (and back here when dismissed) — one table, two homes,
               so no duplicated markup or lost state. -->
          <Teleport :disabled="!tableInDialog" to="#factory-summary-fullscreen-target">
            <v-table
              class="rounded border-md sub-card summary-table"
              fixed-header
              :height="expanded ? 'calc(100vh - 140px)' : tableHeight"
            >
              <thead>
                <tr>
                  <th class="text-left text-h6 border-e-md factory-column" scope="row">
                    <i class="fas fa-industry" /><span class="ml-2">Factory</span>
                  </th>
                  <th class="text-left text-h6 border-e-md satisfaction-column" scope="row">
                    <i class="fas fa-check" /><span class="ml-2">Satisfaction</span>
                  </th>
                  <th class="text-left text-h6 border-e-md" scope="row">
                    <i class="fas fa-conveyor-belt-alt" /><span class="ml-2">Products</span>
                  </th>
                  <th class="text-left text-h6 border-e-md" scope="row">
                    <i class="fas fa-arrow-to-right" /><span class="ml-2">Imports</span>
                  </th>
                  <th class="text-left text-h6" scope="row">
                    <i class="fas fa-truck-container" /><span class="ml-2">Exports</span>
                  </th>
                </tr>
              </thead>
              <!-- Rendering the real rows for a large plan blocks the main thread long
                   enough to feel like a hang, so a reveal paints stand-in rows first.
                   The headings are cheap, so they are the real ones throughout. -->
              <tbody v-if="!tableReady" id="factory-summary-skeleton">
                <tr v-for="(row, index) in ghostRows" :key="`ghost-row-${index}`">
                  <td class="border-e-md factory-column">
                    <div class="ghost ghost-factory" />
                  </td>
                  <td class="border-e-md satisfaction-column">
                    <div class="cell-chips justify-center">
                      <div class="ghost ghost-satisfaction" />
                    </div>
                  </td>
                  <td class="border-e-md">
                    <div class="cell-chips">
                      <div
                        v-for="chip in row.products"
                        :key="`ghost-product-${index}-${chip}`"
                        class="ghost ghost-product"
                      />
                    </div>
                  </td>
                  <td class="border-e-md">
                    <div class="cell-chips">
                      <div
                        v-for="chip in row.imports"
                        :key="`ghost-import-${index}-${chip}`"
                        class="ghost ghost-flow"
                      />
                    </div>
                  </td>
                  <td>
                    <div class="cell-chips">
                      <div
                        v-for="chip in row.exports"
                        :key="`ghost-export-${index}-${chip}`"
                        class="ghost ghost-flow"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
              <tbody v-else ref="contentRef">
                <tr
                  v-for="factory in visibleFactories"
                  :key="factory.id"
                  class="hover"
                  :class="factoryClass(factory)"
                  @click="goToFactory(factory.id as number)"
                >
                  <td class="border-e-md factory-column">
                    <tooltip :text="statusTooltip(factory)">
                      <v-chip class="sf-chip summary-chip factory-chip factory">
                        <factory-icon-display :icon="factory.icon" size="20" />
                        <b class="ml-2">{{ factory.name }}</b>
                      </v-chip>
                    </tooltip>
                  </td>
                  <td class="border-e-md satisfaction-column">
                    <div class="cell-chips justify-center">
                      <v-chip v-if="factory.requirementsSatisfied" class="sf-chip summary-chip green">
                        <i class="fas fa-check" />
                        <b class="ml-2">Satisfied</b>
                      </v-chip>
                      <tooltip
                        v-for="[partId, part] in unsatisfiedParts(factory)"
                        :key="`${factory.id}-shortage-${partId}`"
                        :text="`<b>${getPartDisplayName(partId)}</b>: ${formatNumber(Math.abs(part.amountRemaining))}/min shortage`"
                      >
                        <v-chip class="sf-chip summary-chip red">
                          <game-asset
                            clickable
                            height="32"
                            :subject="partId"
                            type="item"
                            width="32"
                          />
                          <b class="ml-2">-{{ formatNumber(Math.abs(part.amountRemaining)) }}/min</b>
                        </v-chip>
                      </tooltip>
                    </div>
                  </td>
                  <td class="border-e-md">
                    <div class="cell-chips">
                      <tooltip
                        v-for="part in factory.products
                          .slice()
                          .sort((a, b) => getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id)))"
                        :key="`${factory.id}-${part.id}`"
                        :text="productTooltip(factory, part)"
                      >
                        <v-chip class="sf-chip summary-chip blue">
                          <game-asset
                            v-if="part.id"
                            clickable
                            height="32"
                            :subject="part.id"
                            type="item"
                            width="32"
                          />
                          <b class="ml-2">{{ formatNumber(part.amount) }}/min</b>
                        </v-chip>
                      </tooltip>
                    </div>
                  </td>
                  <td class="border-e-md">
                    <div class="cell-chips">
                      <tooltip
                        v-for="summary in calculateImports(factory.inputs)"
                        :key="`${factory.id}-import-${summary.part}`"
                        :text="flowTooltip(summary, 'from')"
                      >
                        <v-chip class="sf-chip summary-chip flow-chip">
                          <div class="flow-chip-content">
                            <div class="d-flex align-center">
                              <game-asset
                                clickable
                                height="32"
                                :subject="summary.part"
                                type="item"
                                width="32"
                              />
                              <b class="ml-2">{{ formatNumber(summary.totalAmount) }}/min</b>
                            </div>
                            <div
                              v-for="source in summary.factories"
                              :key="`${factory.id}-import-${summary.part}-${source.factoryId}`"
                              class="flow-factory"
                              @click.stop="goToFactory(source.factoryId)"
                            >
                              <!-- The factory's own icon rather than a generic arrow: the row
                                   already says which direction the column is, and the icon is how
                                   a factory is recognised everywhere else in the plan. -->
                              <factory-icon-display :icon="getFactoryIcon(source.factoryId)" size="18" />
                              <span class="ml-1">{{ getFactoryName(source.factoryId) }}</span>
                            </div>
                          </div>
                        </v-chip>
                      </tooltip>
                    </div>
                  </td>
                  <td>
                    <div class="cell-chips">
                      <tooltip
                        v-for="summary in calculateExports(factory.dependencies.requests)"
                        :key="`${factory.id}-export-${summary.part}`"
                        :text="flowTooltip(summary, 'to')"
                      >
                        <v-chip class="sf-chip summary-chip flow-chip">
                          <div class="flow-chip-content">
                            <div class="d-flex align-center">
                              <game-asset
                                clickable
                                height="32"
                                :subject="summary.part"
                                type="item"
                                width="32"
                              />
                              <b class="ml-2">{{ formatNumber(summary.totalAmount) }}/min</b>
                            </div>
                            <div
                              v-for="destination in summary.factories"
                              :key="`${factory.id}-export-${summary.part}-${destination.factoryId}`"
                              class="flow-factory"
                              @click.stop="goToFactory(destination.factoryId)"
                            >
                              <factory-icon-display :icon="getFactoryIcon(destination.factoryId)" size="18" />
                              <span class="ml-1">{{ getFactoryName(destination.factoryId) }}</span>
                            </div>
                          </div>
                        </v-chip>
                      </tooltip>
                    </div>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </Teleport>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import {
    Factory,
    FactoryItem,
    PartMetrics,
  } from '@/interfaces/planner/FactoryInterface'
  import {
    getPartDisplayName,
    hasMetricsForPart,
  } from '@/utils/helpers'
  import { calculateExports, calculateImports, PartFlowSummary } from '@/utils/summary'
  import { formatNumber } from '@/utils/numberFormatter'
  import {
    factoryStatusClass,
    factoryStatusTallyChips,
    getFactoryStatuses,
    matchesTallyChip,
    tallyFactoryStatuses,
  } from '@/utils/factory-management/status'
  import eventBus from '@/utils/eventBus'
  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  // Call after the component is mounted
  onMounted(() => {
    nextTick(() => adjustTableHeight())
  })

  const contentRef = ref<HTMLElement | null>(null)
  const headerHeight = 56 // Max height in px
  const maxHeight = 750 // Max height in px
  const tableHeight = ref('tableRef')

  // Initialize the 'hidden' ref based on the value in localStorage
  const hidden = ref<boolean>(localStorage.getItem('summaryHidden') === 'true')

  // Whether the fullscreen dialog is open, and whether the table has moved
  // into it. The two are separate because the teleport target only exists
  // once the dialog content has mounted — enabling the teleport in the same
  // flush crashes with an unresolvable target.
  const expanded = ref<boolean>(false)
  const tableInDialog = ref<boolean>(false)

  watch(expanded, async isOpen => {
    if (isOpen) {
      await nextTick()
      tableInDialog.value = true
    } else {
      tableInDialog.value = false
    }
  })

  watch(hidden, newValue => {
    localStorage.setItem('summaryHidden', newValue.toString())
  })

  // Chips per cell for each stand-in row, taken off a real plan so the ghost has the
  // same ragged shape as the table it precedes. Factory and satisfaction are always
  // one chip; the rest vary.
  const ghostRows = [
    { products: 3, imports: 0, exports: 1 },
    { products: 1, imports: 2, exports: 1 },
    { products: 1, imports: 2, exports: 0 },
    { products: 2, imports: 0, exports: 2 },
    { products: 1, imports: 0, exports: 1 },
    { products: 1, imports: 1, exports: 1 },
    { products: 2, imports: 1, exports: 0 },
    { products: 1, imports: 1, exports: 1 },
  ]

  // Deferred reveal: mounting the full table synchronously with the unhide would freeze
  // the page on large plans before anything visibly changes. Instead the reveal renders
  // the skeleton, the browser gets a frame to paint it, and only then does the heavy
  // table mount (double rAF = "after the skeleton is actually on screen").
  const tableReady = ref<boolean>(!hidden.value)
  watch(hidden, isHidden => {
    if (isHidden) {
      tableReady.value = false // The next reveal defers again.
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      tableReady.value = true
      nextTick(() => adjustTableHeight())
    }))
  })

  // Row count is what materially changes the table's height (it is capped at maxHeight
  // and scrolls internally). A deep watch here re-traversed the entire plan on every
  // flush — a major per-edit cost on large plans — just to re-measure the table.
  watch(
    () => props.factories.length,
    () => {
      nextTick(() => adjustTableHeight())
    },
  )

  const toggleVisibility = () => {
    hidden.value = !hidden.value
  }

  // Navigating to a factory from the fullscreen view must dismiss it first —
  // the scroll target lives in the main content behind the dialog. Wait out
  // the close transition too: scrolling while the dialog's scroll-lock is
  // active and the table is teleporting home aims at a shifting layout.
  const goToFactory = (factoryId: string | number) => {
    const delay = expanded.value ? 400 : 0
    expanded.value = false
    setTimeout(() => navigateToFactory(factoryId), delay)
  }

  // The sidebar's Factories Summary entry can open the fullscreen view too.
  // The table only exists while the section is shown, so unhide it first.
  eventBus.on('openSummaryFullscreen', () => {
    hidden.value = false
    expanded.value = true
  })

  // Sidebar jump-link: landing on a collapsed section just to click Show is pointless,
  // so reveal it before the scroll arrives.
  eventBus.on('openSection', sectionId => {
    if (sectionId === 'factory-summary') {
      hidden.value = false
    }
  })

  // One pass over the plan, indexed per row — same reason as the sidebar's memo.
  const statuses = computed(() => new Map(
    props.factories.map(factory => [factory.id, getFactoryStatuses(factory)]),
  ))

  // Header counts, off the same memo the rows use.
  const statusTally = computed(() => factoryStatusTallyChips(tallyFactoryStatuses(statuses.value.values())))

  // Clicking a count lists the factories behind it. Cleared when the chip it names stops applying,
  // so a filter cannot survive the thing it filtered on being fixed.
  const statusFilter = ref<string | null>(null)
  watch(statusTally, chips => {
    if (statusFilter.value && !chips.some(chip => chip.key === statusFilter.value)) statusFilter.value = null
  })

  const toggleStatusFilter = (key: string) => {
    statusFilter.value = statusFilter.value === key ? null : key
  }

  const activeFilterLabel = computed(() =>
    statusTally.value.find(chip => chip.key === statusFilter.value)?.label ?? ''
  )

  const visibleFactories = computed(() => {
    if (!statusFilter.value) return props.factories
    return props.factories.filter(factory =>
      matchesTallyChip(statuses.value.get(factory.id) ?? [], statusFilter.value as string)
    )
  })

  // This row never painted the amber state at all; factoryStatusClass fixes that for free.
  const factoryClass = (factory: Factory) => factoryStatusClass(statuses.value.get(factory.id))

  // No chips in this table — the Satisfaction column already itemises every shortage and the
  // factory column is the narrowest. The names go in the factory chip's tooltip instead.
  const statusTooltip = (factory: Factory) => {
    const list = statuses.value.get(factory.id) ?? []
    if (!list.length) return `<b>${factory.name}</b>`
    return `<b>${factory.name}</b><br>${list.map(status => status.detailLabel).join('<br>')}`
  }

  const getFactoryName = (factoryId: number): string => {
    return props.factories.find(factory => factory.id === factoryId)?.name ?? 'UNKNOWN'
  }

  const getFactoryIcon = (factoryId: number): string | undefined =>
    props.factories.find(factory => factory.id === factoryId)?.icon

  const unsatisfiedParts = (factory: Factory): [string, PartMetrics][] => {
    return Object.entries(factory.parts).filter(([, part]) => !part.satisfied)
  }

  const productTooltip = (factory: Factory, product: FactoryItem): string => {
    let text = `<b>${getPartDisplayName(product.id)}</b>: ${formatNumber(product.amount)}/min`

    if (hasMetricsForPart(factory, product.id)) {
      const difference = factory.dependencies.metrics[product.id].difference
      if (difference !== 0) {
        const label = difference > 0 ? 'surplus' : 'shortage'
        text += `<br>${formatNumber(Math.abs(difference))}/min ${label}`
      }
    }

    return text
  }

  const flowTooltip = (summary: PartFlowSummary, direction: 'from' | 'to'): string => {
    const lines = summary.factories.map(
      flow => `${direction} <b>${getFactoryName(flow.factoryId)}</b>: ${formatNumber(flow.amount)}/min`
    )
    return `<b>${getPartDisplayName(summary.part)}</b>: ${formatNumber(summary.totalAmount)}/min<br>${lines.join('<br>')}`
  }

  const adjustTableHeight = () => {
    if (contentRef.value) {
      const contentHeight = contentRef.value.offsetHeight // Get current height of the content
      const totalHeight = contentHeight + headerHeight // Add the fixed header height
      const adjustedHeight = Math.min(Math.max(totalHeight), maxHeight) // Enforce min and max height
      tableHeight.value = adjustedHeight + 'px'
    }
  }

</script>

<style lang="scss" scoped>
.filter-hint {
  color: #bdbdbd;
  font-size: 0.95rem;
}

// The selected count reads as pressed: filled rather than tonal, with a ring so it still stands
// out against the header's own background.
.filter-on {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.65);
}

  // Columns size themselves to their content — a column full of "Satisfied"
  // chips stays narrow. The inner wrapper caps how wide the chips can spread
  // before wrapping onto new lines, which also caps the column (auto table
  // layout tracks the widest cell content, and that content can't exceed the
  // wrapper's max-width).
  .cell-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    max-width: 450px;
  }

  // Stand-in chips: same footprint and margins as the real ones they replace, so
  // the ghost rows sit at roughly the height the loaded rows will.
  .ghost {
    position: relative;
    overflow: hidden;
    border-radius: 16px;
    margin: 4px 8px 4px 0;
    background: rgba(var(--v-theme-on-surface), var(--v-border-opacity));

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        90deg,
        rgba(var(--v-theme-surface), 0),
        rgba(var(--v-theme-surface), 0.3),
        rgba(var(--v-theme-surface), 0)
      );
      transform: translateX(-100%);
      animation: ghost-sweep 1.5s linear infinite;
    }
  }

  .ghost-factory {
    width: 160px;
    height: 40px;
  }

  .ghost-satisfaction {
    width: 110px;
    height: 38px;
    margin-inline: 0;
  }

  .ghost-product {
    width: 120px;
    height: 48px;
  }

  .ghost-flow {
    width: 150px;
    height: 70px;
  }

  @keyframes ghost-sweep {
    100% {
      transform: translateX(100%);
    }
  }

  .summary-table {
    // width: 1% is the classic shrink-to-content trick for auto table layout:
    // the column collapses to its min-content width (the widest factory chip)
    // instead of soaking up surplus space in the full-width fullscreen view.
    :deep(.factory-column) {
      width: 1%;
      white-space: nowrap;
    }

    // Same trick for satisfaction: its chips are never much wider than the
    // heading, so the column has no business taking a fifth of the table.
    :deep(.satisfaction-column) {
      width: 1%;
    }

    :deep(thead th) {
      // Icon + heading always on one line — this also sets each column's
      // minimum width, so a column can never shrink below its own heading.
      white-space: nowrap;
    }

    :deep(tbody) {
      tr {
        cursor: pointer;
        transition: background-color 0.3s;

        &:hover td {
          background-color: rgba(70, 70, 70, 0.4);
        }

        &.problem td {
          background-color: var(--sf-problem-bg);
        }

        &.warning td {
          background-color: var(--sf-status-warning-bg);
        }
      }

      td {
        padding: 8px 12px !important;
        height: auto !important;
      }
    }
  }

  // Summary-only chip sizing: Vuetify pins v-chip to a fixed height, which
  // crushes vertical padding. Let these chips grow to fit their content
  // (needed for the multi-line import/export chips) without affecting
  // sf-chip layouts elsewhere in the app.
  .sf-chip.summary-chip {
    height: auto !important;
    min-height: 28px;
    padding: 6px 12px !important;
  }

  .factory-chip {
    font-size: 16px;
    transition: background-color 0.2s;

    &:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }
  }

  .flow-chip {
    // The pill shape looks odd on these chips as their height varies with the
    // number of factory lines inside them.
    border-radius: 8px !important;

    :deep(.v-chip__content) {
      display: block;
    }
  }

  .flow-chip-content {
    padding: 2px 0;

    .flow-factory {
      display: flex;
      align-items: center;
      // A notch up from 13px: the icon beside it sets the row's height, and the old size read as
      // a caption next to it. Not the chip's own size — this is still the smaller line.
      font-size: 14px;
      line-height: 1.4;
      color: var(--sf-factory); // Factory references share the factory token colour

      &:hover {
        text-decoration: underline;
      }
    }
  }
</style>
