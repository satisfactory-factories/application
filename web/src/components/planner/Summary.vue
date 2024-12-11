<template>
  <v-row>
    <v-col>
      <v-card class="factory-card">
        <v-row class="header">
          <v-col class="text-h4 flex-grow-1" cols="8">
            <i class="fas fa-list" /><span class="ml-3">Factories Summary [WIP]</span>
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
        <v-card-text v-show="!hidden" class="text-body-1">
          <p v-show="helpText" class="mb-4">
            <i class="fas fa-info-circle" /> Showing an overview of each factory
            with the name, buildings and their production.
          </p>

          <v-table
            ref="tableRef"
            class="rounded border-md sub-card"
            fixed-header
            :height="tableHeight"
          >
            <thead>
              <tr>
                <th class="text-left text-h6 table-column border-e-md" scope="row">
                  <i class="fas fa-industry" /><span class="ml-2">Factory Name</span>
                </th>
                <th class="text-left text-h6 table-column border-e-md" scope="row">
                  <i class="fas fa-building" /><span class="ml-2">Buildings</span>
                </th>
                <th class="text-left text-h6 table-column border-e-md" scope="row">
                  <i class="fas fa-box" /><span class="ml-2">Items</span>
                </th>
                <th class="text-left text-h6 table-column border-e-md" scope="row">
                  <i class="fas fa-arrow-to-right" /><span class="ml-2">Imports</span>
                </th>
                <th class="text-left text-h6 table-column border-e-md" scope="row">
                  <i class="fas fa-truck-container" /><span class="ml-2">Exports</span>
                </th>
              </tr>
            </thead>
            <tbody ref="contentRef">
              <tr
                v-for="factory in factories"
                :key="factory.id"
                class="header p-5 hover"
                :class="factoryClass(factory)"
                @click="navigateToFactory(factory.id as number)"
              >
                <td class="header border-e-md">{{ factory.name }}</td>
                <td class="header border-e-md">
                  <span
                    v-for="([, buildingData], buildingIndex) in Object.entries(factory.buildingRequirements)
                      .sort(([, a], [, b]) => getBuildingDisplayName(a.name).localeCompare(getBuildingDisplayName(b.name)))"
                    :key="buildingIndex"
                    style="display: inline"
                  >
                    <v-chip class="sf-chip small no-margin orange" variant="tonal">
                      <game-asset
                        :subject="buildingData.name"
                        type="building"
                      />
                      <span class="ml-1">
                        <b>{{
                          getBuildingDisplayName(buildingData.name) ?? "UNKNOWN"
                        }}</b>: {{ formatNumber(buildingData.amount) ?? 0 }}x
                      </span>
                    </v-chip>
                  </span>
                </td>
                <td class="header border-e-md">
                  <v-chip
                    v-for="part in factory.products
                      .slice()
                      .sort((a, b) => getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id)))"
                    :key="`${factory.id}-${part.id}`"
                    class="sf-chip small m-2"
                  >
                    <span class="mr-2">
                      <game-asset
                        v-if="part.id"
                        :subject="part.id"
                        type="item"
                      />
                    </span>
                    <span>
                      <b>{{ getPartDisplayName(part.id) }}</b>: {{ formatNumber(part.amount) }}/min
                    </span>
                    <span
                      v-if="
                        hasMetricsForPart(factory, part.id) &&
                          factory.dependencies.metrics[part.id].difference !== 0
                      "
                      class="ml-2"
                      :class="
                        differenceClass(
                          factory.dependencies.metrics[part.id].difference
                        )
                      "
                    >({{
                      formatNumber(
                        factory.dependencies.metrics[part.id].difference
                      )
                    }}/min)</span>
                  </v-chip>
                </td>
                <td class="header border-e-md">
                  <v-chip
                    v-for="(
                      totals
                    ) in calculateTotalDependencies(factory.inputs)"
                    :key="`${factory.id}-${totals.outputPart}`"
                    class="sf-chip small m-2"
                  >
                    <game-asset
                      v-if="totals.outputPart"
                      height="32"
                      :subject="totals.outputPart"
                      type="item"
                      width="32"
                    />
                    <span class="ml-2">
                      <b>{{ getPartDisplayName(totals.outputPart) }}:</b>
                      {{ formatNumber(totals.totalAmount) }}/min
                    </span>
                  </v-chip>
                </td>
                <td class="header border-e-md">
                  <v-chip
                    v-for="(
                      totals
                    ) in calculateTotalDependencyRequests(
                      factory.dependencies.requests
                    )"
                    :key="totals.part"
                    class="sf-chip small m-2"
                  >
                    <game-asset
                      v-if="totals.part"
                      height="32"
                      :subject="totals.part"
                      type="item"
                      width="32"
                    />
                    <span class="ml-2">
                      <b>{{ getPartDisplayName(totals.part) }}:</b>
                      {{ formatNumber(totals.totalAmount) }}/min
                    </span>
                  </v-chip>
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
  } from '@/interfaces/planner/FactoryInterface'
  import {
    differenceClass,
    getPartDisplayName,
    hasMetricsForPart,
  } from '@/utils/helpers'
  import { calculateTotalDependencies, calculateTotalDependencyRequests } from '@/utils/summary'
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

  const tableRef = ref<HTMLElement | null>(null)
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

  const getBuildingDisplayName = inject('getBuildingDisplayName') as (
    part: string
  ) => string

  const factoryClass = (factory: Factory) => {
    return {
      'factory-card': true,
      problem: factory.hasProblem,
    }
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
  .table-column{
    min-width: 250px;
  }
</style>
