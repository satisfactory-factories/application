<template>
  <v-row id="factory-summary">
    <v-col>
      <v-card class="factory-card">
        <v-row class="header">
          <v-col class="text-h4 flex-grow-1 d-flex align-center" cols="8">
            <i class="fas fa-list" /><span class="ml-3">Factories Summary</span>
            <v-chip
              v-if="factories.length > 0"
              id="factory-summary-count"
              class="sf-chip factory ml-3"
              variant="tonal"
            >
              <i class="fas fa-industry" />
              <span class="ml-2">{{ factories.length }} {{ factories.length === 1 ? 'factory' : 'factories' }}</span>
            </v-chip>
          </v-col>
          <v-col class="text-right" cols="4">
            <v-btn
              v-show="!hidden"
              color="primary"
              prepend-icon="fas fa-eye-slash"
              variant="outlined"
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

          <v-table
            class="rounded border-md sub-card summary-table"
            fixed-header
            :height="tableHeight"
          >
            <thead>
              <tr>
                <th class="text-left text-h6 name-column border-e-md" scope="row">
                  <i class="fas fa-industry" /><span class="ml-2">Factory</span>
                </th>
                <th class="text-left text-h6 table-column fixed-column border-e-md" scope="row">
                  <i class="fas fa-conveyor-belt-alt" /><span class="ml-2">Products</span>
                </th>
                <th class="text-left text-h6 table-column fixed-column border-e-md" scope="row">
                  <i class="fas fa-check" /><span class="ml-2">Satisfaction</span>
                </th>
                <th class="text-left text-h6 table-column border-e-md" scope="row">
                  <i class="fas fa-arrow-to-right" /><span class="ml-2">Imports</span>
                </th>
                <th class="text-left text-h6 table-column" scope="row">
                  <i class="fas fa-truck-container" /><span class="ml-2">Exports</span>
                </th>
              </tr>
            </thead>
            <tbody ref="contentRef">
              <tr
                v-for="factory in factories"
                :key="factory.id"
                class="hover"
                :class="factoryClass(factory)"
                @click="navigateToFactory(factory.id as number)"
              >
                <td class="border-e-md">
                  <v-chip class="sf-chip summary-chip factory-chip factory">
                    <i class="fas fa-industry" />
                    <b class="ml-2">{{ factory.name }}</b>
                  </v-chip>
                </td>
                <td class="border-e-md fixed-column">
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
                </td>
                <td class="border-e-md fixed-column">
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
                </td>
                <td class="border-e-md">
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
                          @click.stop="navigateToFactory(source.factoryId)"
                        >
                          <i class="fas fa-arrow-to-right" /> {{ getFactoryName(source.factoryId) }}
                        </div>
                      </div>
                    </v-chip>
                  </tooltip>
                </td>
                <td>
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
                          @click.stop="navigateToFactory(destination.factoryId)"
                        >
                          <i class="fas fa-truck-container" /> {{ getFactoryName(destination.factoryId) }}
                        </div>
                      </div>
                    </v-chip>
                  </tooltip>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { nextTick, ref, watch } from 'vue'
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

  watch(hidden, newValue => {
    localStorage.setItem('summaryHidden', newValue.toString())
  })

  watch(
    () => props.factories, // The data to watch
    () => {
      nextTick(() => adjustTableHeight()) // Callback to adjust height after changes
    },
    { deep: true } // Option to deeply watch for changes within the array
  )

  const toggleVisibility = () => {
    hidden.value = !hidden.value
  }

  const factoryClass = (factory: Factory) => {
    return {
      problem: factory.hasProblem,
    }
  }

  const getFactoryName = (factoryId: number): string => {
    return props.factories.find(factory => factory.id === factoryId)?.name ?? 'UNKNOWN'
  }

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
  .name-column {
    min-width: 150px;
  }

  .table-column {
    min-width: 180px;
  }

  // Products and Satisfaction can accumulate a lot of chips; cap their width
  // and let the chips wrap onto new lines rather than stretching the table.
  .fixed-column {
    width: 450px;
    max-width: 450px;
    min-width: 450px;
  }

  .summary-table {
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
      }

      td {
        padding: 8px 12px !important;
        height: auto !important;
        // Keep each cell's chips on a single line — the table scrolls
        // horizontally if a factory has too many to fit.
        white-space: nowrap;

        // The fixed-width Products/Satisfaction columns wrap their chips onto
        // new lines instead, so they never widen the table.
        &.fixed-column {
          white-space: normal;
        }
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
      font-size: 13px;
      line-height: 1.4;
      color: var(--sf-factory); // Factory references share the factory token colour

      &:hover {
        text-decoration: underline;
      }
    }
  }
</style>
