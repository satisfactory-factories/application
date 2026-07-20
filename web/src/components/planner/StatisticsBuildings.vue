<template>
  <div class="d-flex align-center">
    <h4 class="text-h4">
      <i class="fas fa-building" />
      <span class="ml-3">Building Summary</span>
    </h4>
    <v-chip
      v-if="totalBuildingCount > 0"
      id="stats-buildings-summary"
      class="sf-chip building ml-3"
      variant="tonal"
    >
      {{ formatNumber(totalBuildingCount) }} {{ totalBuildingCount === 1 ? 'building' : 'buildings' }}
    </v-chip>
    <v-btn
      class="ml-auto"
      color="primary"
      :prepend-icon="hidden ? 'fas fa-eye' : 'fas fa-eye-slash'"
      size="small"
      variant="outlined"
      @click="hidden = !hidden"
    >{{ hidden ? 'Show' : 'Hide' }}</v-btn>
  </div>
  <template v-if="!hidden">
    <p v-show="helpText" class="mb-4">
      <i class="fas fa-info-circle" /> Shows the amount buildings of each
      type in all your factories.
    </p>
    <div v-if="totalBuildingsByType.length > 0">
      <span v-for="(building, type) in totalBuildingsByType" :key="type">
        <v-chip class="sf-chip orange" variant="tonal">
          <game-asset clickable :subject="building.name" type="building" />
          <span class="ml-1">
            <b>{{ getBuildingDisplayName(building.name) ?? "UNKNOWN" }}</b>: {{ formatNumber(building.totalAmount) ?? 0 }}x
          </span>
        </v-chip>
      </span>
    </div>
    <p v-else class="text-body-1">Awaiting Building Construction</p>
  </template>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import { calculateTotalBuildingsByType } from '@/utils/statistics'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  const totalBuildingsByType = computed(() => calculateTotalBuildingsByType(props.factories))

  // Header at-a-glance count, shown whether the section is open or collapsed.
  const totalBuildingCount = computed(() => totalBuildingsByType.value.reduce((total, building) => total + building.totalAmount, 0))

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('statisticsBuildingSummaryHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('statisticsBuildingSummaryHidden', value.toString())
  })
</script>
