<template>
  <h1 class="text-h5 mb-4">
    <i class="fas fa-building" />
    <span class="ml-3">Building Summary</span>
  </h1>
  <p v-show="helpText" class="mb-4">
    <i class="fas fa-info-circle" /> Shows the amount buildings of each
    type in all your factories.
  </p>
  <div v-if="totalBuildingsByType.length > 0">
    <span v-for="(building, type) in totalBuildingsByType" :key="type">
      <v-chip class="sf-chip orange" variant="tonal">
        <game-asset :subject="building.name" type="building" />
        <span class="ml-1">
          <b>{{ getBuildingDisplayName(building.name) ?? "UNKNOWN" }}</b>: {{ formatNumber(building.totalAmount) ?? 0 }}x
        </span>
      </v-chip>
    </span>
  </div>
  <p v-else class="text-body-1">Awaiting Building Construction</p>
</template>

    <script setup lang="ts">
  import { computed } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import { calculateTotalBuildingsByType } from '@/utils/statistics'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  const getBuildingDisplayName = inject('getBuildingDisplayName') as (
    part: string
  ) => string

  const totalBuildingsByType = computed(() => calculateTotalBuildingsByType(props.factories))
    </script>
