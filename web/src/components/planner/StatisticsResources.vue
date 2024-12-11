<template>
  <!-- Raw Resources Area -->
  <h1 class="text-h5 mb-4">
    <i class="fas fa-globe" />
    <span class="ml-3">Raw Resources</span>
  </h1>
  <p v-show="helpText" class="mb-4">
    <i class="fas fa-info-circle" /> Shows the amount of raw resources
    consumed by all your factories.
  </p>
  <div v-if="allFactoryRawResources.length > 0">
    <span v-for="(resource, id) in allFactoryRawResources" :key="id">
      <v-chip class="sf-chip blue" variant="tonal">
        <game-asset :subject="resource.id.toString()" type="item" />
        <span class="ml-2">
          <b>{{ getPartDisplayName(resource.id.toString()) }}</b>: {{ formatNumber(resource.totalAmount) }}/min
        </span>
      </v-chip>
    </span>
  </div>
  <p v-else class="text-body-1">Awaiting Resource Consumption</p>
</template>

    <script setup lang="ts">
  import { computed } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import { calculateTotalRawResources } from '@/utils/statistics'
  import {
    getPartDisplayName,
  } from '@/utils/helpers'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  // This function calculates total number of raw resources required for all the factories combined
  const allFactoryRawResources = computed(() => calculateTotalRawResources(props.factories))

    </script>
