<template>
  <div class="d-flex align-center">
    <h4 class="text-h4 d-flex align-center">
      <span class="stats-heading-icon"><i class="fas fa-building section-icon" /></span>Building Summary
    </h4>
    <v-chip
      v-if="totalBuildingCount > 0"
      id="stats-buildings-summary"
      class="sf-chip building small ml-3"
      variant="tonal"
    >
      {{ formatNumber(totalBuildingCount) }} {{ totalBuildingCount === 1 ? 'building' : 'buildings' }}
    </v-chip>
    <v-btn
      class="ml-auto"
      color="primary"
      :prepend-icon="hidden ? 'fas fa-eye' : 'fas fa-eye-slash'"
      size="small"
      :variant="hidden ? 'outlined' : 'flat'"
      @click="hidden = !hidden"
    >{{ hidden ? 'Show' : 'Hide' }}</v-btn>
  </div>
  <template v-if="!hidden">
    <v-table v-if="totalBuildingsByType.length > 0" id="stats-buildings" class="stats-table" density="compact">
      <thead>
        <tr>
          <th>Building</th>
          <th class="text-right">Total</th>
          <th>Where</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="building in totalBuildingsByType" :key="building.name">
          <td>
            <v-chip class="sf-chip building no-margin" variant="tonal">
              <game-asset clickable :subject="building.name" type="building" />
              <b class="ml-2">{{ getBuildingDisplayName(building.name) ?? "UNKNOWN" }}</b>
            </v-chip>
          </td>
          <td class="text-right"><b>{{ formatNumber(building.totalAmount) }}</b>x</td>
          <td>
            <!-- One chip per factory holding them, the same shape the other statistics tables
                 use: icon, name, its own count, and a click that goes there. The building is
                 named in the first column, so the chip carries only the factory and the number. -->
            <div class="d-flex flex-wrap ga-2">
              <div
                v-for="source in building.sources"
                :key="source.id"
                class="factory-group-chip clickable"
                @click="navigateToFactory(source.id)"
              >
                <factory-icon-display class="ml-1" :icon="source.icon" size="20" />
                <span class="mx-2"><b>{{ source.name }}</b></span>
                <v-chip class="sf-chip small building">{{ formatNumber(source.amount) }}x</v-chip>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </v-table>
    <p v-else class="text-body-1">Awaiting Building Construction</p>
  </template>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import { calculateTotalBuildingsByType } from '@/utils/statistics'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'

  const props = defineProps<{
    factories: Factory[];
  }>()

  const totalBuildingsByType = computed(() => calculateTotalBuildingsByType(props.factories))

  // Header at-a-glance count, shown whether the section is open or collapsed.
  const totalBuildingCount = computed(() => totalBuildingsByType.value.reduce((total, building) => total + building.totalAmount, 0))

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  // Section visibility, persisted. Hidden by default until explicitly shown.
  const hidden = ref<boolean>(localStorage.getItem('statisticsBuildingSummaryHidden') !== 'false')
  watch(hidden, value => {
    localStorage.setItem('statisticsBuildingSummaryHidden', value.toString())
  })
</script>

<style lang="scss" scoped>
// Matches the `building` chip colour used below (and throughout the app for buildings).
.section-icon {
  color: var(--sf-building);
}

.stats-table {
  background-color: transparent;

  // The factory column carries the width; the other two only need enough not to wrap their own
  // contents, or one long factory name folds the building name onto two lines.
  th:nth-child(1),
  td:nth-child(1),
  th:nth-child(2),
  td:nth-child(2) {
    white-space: nowrap;
    width: 1%;
  }

  // v-table sizes cells for one line; these rows hold chips and wrap.
  td {
    padding-top: 6px !important;
    padding-bottom: 6px !important;
    height: auto !important;
  }
}
</style>
