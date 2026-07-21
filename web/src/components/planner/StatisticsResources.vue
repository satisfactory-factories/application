<template>
  <div class="d-flex align-center">
    <h4 class="text-h4">
      <i class="fas fa-globe" />
      <span class="ml-3">Raw Resources</span>
    </h4>
    <v-chip
      v-if="allFactoryRawResources.length > 0"
      id="stats-raw-resources-summary"
      class="sf-chip raw-resource ml-3"
      variant="tonal"
    >
      {{ allFactoryRawResources.length }} {{ allFactoryRawResources.length === 1 ? 'resource' : 'resources' }}
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
    <p v-show="helpText" class="mb-4">
      <i class="fas fa-info-circle" /> Shows the amount of raw resources
      consumed by all your factories.
    </p>
    <div v-if="allFactoryRawResources.length > 0">
      <span v-for="(resource, id) in allFactoryRawResources" :key="id">
        <v-chip class="sf-chip cyan" variant="tonal">
          <game-asset clickable :subject="resource.id.toString()" type="item" />
          <span class="ml-2">
            <b>{{ getPartDisplayName(resource.id.toString()) }}</b>: {{ formatNumber(resource.totalAmount) }}/min
          </span>
        </v-chip>
      </span>
    </div>
    <p v-else class="text-body-1">Awaiting Resource Consumption</p>
  </template>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
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

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('statisticsRawResourcesHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('statisticsRawResourcesHidden', value.toString())
  })
</script>
