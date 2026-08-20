<!-- The Factories Summary table itself, so the planner's own section and the fullscreen dialog can
     each own an instance instead of sharing one.

     They used to share a single table moved between the two by <Teleport>. That coupled them in
     three ways that all read as bugs: opening a group's breakdown re-filtered the section in the
     planner, dismissing it made that section rebuild every row (seconds of blocked main thread on a
     124-factory plan, because the dialog had only held a handful), and the section had to be
     un-hidden on open or the teleport had nowhere to move the table from. Two instances of one
     component cost a second render while the dialog is open and untangle all three. -->
<template>
  <v-table
    class="rounded border-md sub-card summary-table"
    fixed-header
    :height="height"
  >
    <thead>
      <tr>
        <th class="text-left text-h6 border-e-md factory-column" scope="row">
          <i class="fas fa-industry" /><span class="ml-2">Factory</span>
        </th>
        <th class="text-left text-h6 border-e-md satisfaction-column" scope="row">
          <i class="fas fa-check" /><span class="ml-2">Satisfaction</span>
        </th>
        <!-- "& Power" rather than "Products": the column carries power generators too, and a
             generator chip under a heading that says Products is the same mislabel as a bare
             building icon on the chip itself. -->
        <th class="text-left text-h6 border-e-md" scope="row">
          <i class="fas fa-conveyor-belt-alt" /><span class="ml-2">Products &amp; Power</span>
        </th>
        <th class="text-left text-h6 border-e-md" scope="row">
          <i class="fas fa-arrow-to-right" /><span class="ml-2">Imports</span>
        </th>
        <th class="text-left text-h6" scope="row">
          <i class="fas fa-truck-container" /><span class="ml-2">Exports</span>
        </th>
      </tr>
    </thead>
    <!-- Rendering the real rows for a large plan blocks the main thread long enough to feel like a
         hang, so a reveal paints stand-in rows first. The headings are cheap, so they are the real
         ones throughout. -->
    <tbody v-if="!ready" :id="skeletonId">
      <tr v-for="(row, index) in GHOST_ROWS" :key="`ghost-row-${index}`">
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
        v-for="factory in rows"
        :key="factory.id"
        class="hover"
        :class="factoryStatusClass(statuses.get(factory.id))"
        @click="emit('navigate', factory.id as number)"
      >
        <td class="border-e-md factory-column">
          <v-chip class="sf-chip summary-chip factory-chip factory">
            <factory-icon-display :icon="factory.icon" size="20" />
            <b class="ml-2">{{ factory.name }}</b>
          </v-chip>
          <!-- The same chips the sidebar entry wears, under the name for the same reason: a tinted
               row says something is wrong without saying what. Import statuses are the exception,
               going in the column that owns them. -->
          <factory-status-chips
            navigable
            :statuses="nonImportStatuses(factory)"
            @navigate="target => goToStatus(factory.id as number, target)"
          />
        </td>
        <td class="border-e-md satisfaction-column">
          <div class="cell-chips justify-center">
            <!-- requirementsSatisfied is forced true for a factory with no products, so a
                 power-only factory short of its fuel showed the green tick and the red shortage
                 beside it. The parts are the honest half. -->
            <v-chip
              v-if="factory.requirementsSatisfied && unsatisfiedParts(factory).length === 0"
              class="sf-chip summary-chip green"
            >
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
              v-for="part in sortedProducts(factory)"
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
            <!-- Power generators belong in this column for the same reason they belong in the
                 collapsed card's Producing row: a factory of nothing but generators had an empty
                 cell here, reading as a factory that does nothing. Green and bolt-led, as
                 everywhere else power is stated; the generator's name and count are in the
                 tooltip, which is where this table puts a chip's detail. -->
            <tooltip
              v-for="(producer, producerIndex) in factory.powerProducers"
              :key="`${factory.id}-power-${producerIndex}`"
              :text="producerTooltip(producer)"
            >
              <v-chip class="sf-chip summary-chip green">
                <i class="fas fa-bolt" />
                <i class="fas fa-plus mr-2" />
                <game-asset
                  v-if="producer.building"
                  clickable
                  height="32"
                  :subject="producer.building"
                  type="building"
                  width="32"
                />
                <b class="ml-2">{{ formatMw(producer.powerProduced) }}</b>
              </v-chip>
            </tooltip>
            <!-- And custom buildings, for the same reason: a portal room produces nothing at
                 all, so this cell was its only chance to say what is in it. -->
            <tooltip
              v-for="(customBuilding, customIndex) in factory.customBuildings"
              :key="`${factory.id}-custom-${customIndex}`"
              :text="customBuildingTooltip(customBuilding)"
            >
              <v-chip class="sf-chip summary-chip custom-building">
                <game-asset
                  v-if="customBuilding.building"
                  clickable
                  height="32"
                  :subject="customBuilding.building"
                  type="building"
                  width="32"
                />
                <b class="ml-2">{{ formatNumber(Math.ceil(customBuilding.amount)) }}x</b>
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
                    @click.stop="emit('navigate', source.factoryId)"
                  >
                    <!-- The factory's own icon rather than a generic arrow: the row already says
                         which direction the column is, and the icon is how a factory is recognised
                         everywhere else in the plan. -->
                    <factory-icon-display :icon="getFactoryIcon(source.factoryId)" size="18" />
                    <span class="ml-1">{{ getFactoryName(source.factoryId) }}</span>
                  </div>
                </div>
              </v-chip>
            </tooltip>
          </div>
          <!-- Under the imports themselves rather than beside the factory's name: a redundant or
               duplicated import is a fact about this column. -->
          <factory-status-chips
            navigable
            :statuses="importStatuses(factory)"
            @navigate="target => goToStatus(factory.id as number, target)"
          />
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
                    @click.stop="emit('navigate', destination.factoryId)"
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
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import {
    Factory,
    FactoryCustomBuilding,
    FactoryItem,
    FactoryPowerProducer,
    PartMetrics,
  } from '@/interfaces/planner/FactoryInterface'
  import { getPartDisplayName, hasMetricsForPart } from '@/utils/helpers'
  import { calculateExports, calculateImports, PartFlowSummary } from '@/utils/summary'
  import { formatMw, formatNumber } from '@/utils/numberFormatter'
  import { getBuildingDisplayName, getPowerProducerDisplayName } from '@/utils/factory-management/common'
  import {
    FactoryStatus,
    factoryStatusClass,
    FactoryStatusSection,
    getSectionStatuses,
    statusJumpTargets,
  } from '@/utils/factory-management/status'

  const props = withDefaults(defineProps<{
    // The rows to draw.
    rows: Factory[]
    // The whole plan, for naming the factory on the other end of an import or export. A row can
    // reference a factory that is not itself a row.
    allFactories: Factory[]
    statuses: Map<number, FactoryStatus[]>
    height?: string
    // Set on the skeleton tbody so a test can tell which instance is standing in.
    skeletonId?: string
    // False holds the skeleton up and builds nothing. The fullscreen view uses it to keep the rows
    // out of its opening animation: building them takes long enough on a large plan to stall the
    // transition, so the panel froze half-open. It goes true once the panel has finished opening.
    enabled?: boolean
  }>(), {
    height: undefined,
    skeletonId: undefined,
    enabled: true,
  })

  const emit = defineEmits<{
    // A factory id, optionally with the element to land on and a fallback if that row is not in
    // the DOM yet. The parent owns navigation because only it knows whether a dialog must close.
    (event: 'navigate', factoryId: number, subsection?: string | string[], fallback?: string): void
    (event: 'measured', height: number): void
  }>()

  // Chips per cell for each stand-in row, taken off a real plan so the ghost has the same ragged
  // shape as the table it precedes. Factory and satisfaction are always one chip; the rest vary.
  const GHOST_ROWS = [
    { products: 3, imports: 0, exports: 1 },
    { products: 1, imports: 2, exports: 1 },
    { products: 1, imports: 2, exports: 0 },
    { products: 2, imports: 0, exports: 2 },
    { products: 1, imports: 0, exports: 1 },
    { products: 1, imports: 1, exports: 1 },
    { products: 2, imports: 1, exports: 0 },
    { products: 1, imports: 1, exports: 1 },
  ]

  const contentRef = ref<HTMLElement | null>(null)

  /**
   * Deferred reveal. Mounting the real rows synchronously freezes the page before anything visibly
   * changes, so the skeleton renders, the browser gets a frame to paint it, and only then do the
   * rows mount. Double rAF is "after the skeleton is actually on screen".
   *
   * Owned here rather than by the parent: each instance defers its own first paint, and a filter
   * change is the same cost as a first mount, so it defers again.
   */
  const revealed = ref(false)

  // Both halves have to agree: this instance has waited its frames, and the parent is happy for the
  // work to happen at all.
  const ready = computed(() => revealed.value && props.enabled)

  const reveal = () => {
    revealed.value = false
    requestAnimationFrame(() => requestAnimationFrame(() => {
      revealed.value = true
      nextTick(measure)
    }))
  }

  onMounted(reveal)

  // Keyed on the ids rather than the array: an ordinary recalculation replaces the objects without
  // changing which factories are listed, and re-revealing on that would flicker on every edit.
  const rowKey = computed(() => props.rows.map(factory => factory.id).join(','))
  watch(rowKey, reveal)

  // Being switched on is the same event as mounting, as far as the frame budget goes.
  watch(() => props.enabled, isEnabled => {
    if (isEnabled) reveal()
  })

  const measure = () => {
    if (contentRef.value) emit('measured', contentRef.value.offsetHeight)
  }

  const factoryById = computed(() => new Map(props.allFactories.map(factory => [factory.id, factory])))

  const getFactoryName = (factoryId: number): string =>
    factoryById.value.get(factoryId)?.name ?? 'UNKNOWN'

  const getFactoryIcon = (factoryId: number): string | undefined =>
    factoryById.value.get(factoryId)?.icon

  const statusesFor = (factory: Factory) => props.statuses.get(factory.id) ?? []

  // A chip goes in the column that owns its section where this table has one. Only imports do:
  // Satisfaction and Products already itemise every part they name, so a chip there would say the
  // same thing twice, and the factory column is where the rest belong.
  const importStatuses = (factory: Factory) => getSectionStatuses(statusesFor(factory), 'imports')

  const nonImportStatuses = (factory: Factory) =>
    statusesFor(factory).filter(status => status.section !== 'imports')

  // Aims at every row the status names, with its section as the fallback for anything with no row
  // of its own. The parent composes nothing: it only has to get us to the factory.
  const goToStatus = (factoryId: number, target: { section: FactoryStatusSection, subjects: string[] }) => {
    const { targets, fallback } = statusJumpTargets(factoryId, target)
    emit('navigate', factoryId, targets, fallback)
  }

  const unsatisfiedParts = (factory: Factory): [string, PartMetrics][] =>
    Object.entries(factory.parts).filter(([, part]) => !part.satisfied)

  const sortedProducts = (factory: Factory) => factory.products
    .slice()
    .sort((a, b) => getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id)))

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

  // Name and building count go in the tooltip, matching how a product chip states its part: the
  // cell stays narrow enough for a plan with a hundred rows in it.
  const producerTooltip = (producer: FactoryPowerProducer): string =>
    `<b>${getPowerProducerDisplayName(producer)}</b>: ${formatNumber(Math.ceil(producer.buildingAmount))}x` +
    `<br>${formatMw(producer.powerProduced)} to the grid`

  const customBuildingTooltip = (customBuilding: FactoryCustomBuilding): string =>
    `<b>${getBuildingDisplayName(customBuilding.building)}</b>: ${formatNumber(Math.ceil(customBuilding.amount))}x` +
    `<br>${formatMw(customBuilding.powerConsumed)} drawn`

  const flowTooltip = (summary: PartFlowSummary, direction: 'from' | 'to'): string => {
    const lines = summary.factories.map(
      flow => `${direction} <b>${getFactoryName(flow.factoryId)}</b>: ${formatNumber(flow.amount)}/min`
    )
    return `<b>${getPartDisplayName(summary.part)}</b>: ${formatNumber(summary.totalAmount)}/min<br>${lines.join('<br>')}`
  }
</script>

<style lang="scss" scoped>
// Columns size themselves to their content: a column full of "Satisfied" chips stays narrow. The
// inner wrapper caps how wide the chips can spread before wrapping onto new lines, which also caps
// the column (auto table layout tracks the widest cell content, and that content cannot exceed the
// wrapper's max-width).
.cell-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  max-width: 450px;
}

// Stand-in chips: same footprint and margins as the real ones they replace, so the ghost rows sit
// at roughly the height the loaded rows will.
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
  // width: 1% is the classic shrink-to-content trick for auto table layout: the column collapses to
  // its min-content width (the widest factory chip) instead of soaking up surplus space in the
  // full-width fullscreen view.
  :deep(.factory-column) {
    width: 1%;
    white-space: nowrap;
  }

  // Same trick for satisfaction: its chips are never much wider than the heading, so the column has
  // no business taking a fifth of the table.
  :deep(.satisfaction-column) {
    width: 1%;
  }

  // Status chips sit on their own line under whatever the cell already shows, so they need the
  // gutter the sidebar's `stacked` rule gives them there. They wrap within the width the content
  // above them has already set, so they never widen a column on their own.
  :deep(.status-chips-inner) {
    padding-top: 4px;
  }

  :deep(thead th) {
    // Icon + heading always on one line. This also sets each column's minimum width, so a column
    // can never shrink below its own heading.
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

// Summary-only chip sizing: Vuetify pins v-chip to a fixed height, which crushes vertical padding.
// Let these chips grow to fit their content (needed for the multi-line import/export chips) without
// affecting sf-chip layouts elsewhere in the app.
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
  // The pill shape looks odd on these chips as their height varies with the number of factory lines
  // inside them.
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
    // A notch up from 13px: the icon beside it sets the row's height, and the old size read as a
    // caption next to it. Not the chip's own size, this is still the smaller line.
    font-size: 14px;
    line-height: 1.4;
    color: var(--sf-factory); // Factory references share the factory token colour

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
