<template>
  <v-row>
    <v-col>
      <v-card class="factory-card">
        <v-row class="header">
          <v-col class="text-h4 flex-grow-1" cols="8">
            <i class="fas fa-list" /><span class="ml-3">Factories Summary</span>
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
            with the name, machines and their production.
          </p>

          <v-table
            ref="tableRef"
            fixed-header
            :height="tableHeight"
          >
            <thead>
              <tr>
                <th class="text-left table-column">Factory Name</th>
                <th class="text-left table-column">Machines</th>
                <th class="text-left table-column">Producing</th>
                <th class="text-left table-column">Importing</th>
                <th class="text-left table-column">Exporting</th>
              </tr>
            </thead>
            <tbody ref="contentRef">
              <tr
                v-for="factory in factories"
                :key="factory.id"
                class="header"
                :class="factoryClass(factory)"
              >
                <td class="header">{{ factory.name }}</td>
                <td class="header">
                  <span
                    v-for="([, buildingData], buildingIndex) in Object.entries(factory.buildingRequirements)
                      .sort(([, a], [, b]) => getBuildingDisplayName(a.name).localeCompare(getBuildingDisplayName(b.name)))"
                    :key="buildingIndex"
                    style="display: inline"
                  >
                    <v-chip class="sf-chip orange" variant="tonal">
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
                <td class="header">
                  <v-chip
                    v-for="part in factory.products
                      .slice()
                      .sort((a, b) => getPartDisplayName(a.id).localeCompare(getPartDisplayName(b.id)))"
                    :key="`${factory.id}-${part.id}`"
                    class="sf-chip"
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
                <td class="header">
                  <v-chip
                    v-for="(
                      totals
                    ) in calculateTotalDependencies(factory.inputs)"
                    :key="`${factory.id}-${totals.outputPart}`"
                    class="sf-chip ml-2"
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
                <td class="header">
                  <v-chip
                    v-for="(
                      totals
                    ) in calculateTotalDependencyRequests(
                      factory.dependencies.requests
                    )"
                    :key="totals.part"
                    class="sf-chip ml-2"
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
    FactoryDependencyRequest,
    FactoryInput,
  } from '@/interfaces/planner/FactoryInterface'
  import {
    differenceClass,
    getPartDisplayName,
    hasMetricsForPart,
  } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
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
  const tableHeight = ref('auto')

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

  // This function finds out which items are being imported into the factory and their quantity
  const calculateTotalDependencies = (inputs: FactoryInput[]) => {
    const totals: Record<string, number> = {}

    inputs.forEach(input => {
      const { outputPart, amount } = input
      if (outputPart) {
        if (!totals[outputPart]) {
          totals[outputPart] = 0
        }
        totals[outputPart] += amount
      }
    })

    return Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ outputPart: key, totalAmount: value }))
  }

  // This function finds out which items are being exported from the factory and their quantity
  const calculateTotalDependencyRequests = (
    requests: Record<string, FactoryDependencyRequest[]>
  ) => {
    const totals: Record<string, number> = {}

    Object.values(requests).forEach(dependencyRequests => {
      dependencyRequests.forEach(request => {
        const { part, amount } = request

        if (part) {
          if (!totals[part]) {
            totals[part] = 0
          }
          totals[part] += amount
        }
      })
    })

    return Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ part: key, totalAmount: value }))
  }
  </script>

<style lang="scss" scoped>
  .table-column{
    min-width: 250px;
  }
</style>
