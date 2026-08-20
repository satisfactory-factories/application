<template>
  <div class="d-flex align-center">
    <h4 class="text-h4 d-flex align-center">
      <span class="stats-heading-icon"><i class="fas fa-globe section-icon" /></span>Raw Resources
    </h4>
    <v-chip
      v-if="allFactoryRawResources.length > 0"
      id="stats-raw-resources-summary"
      class="sf-chip raw-resource small ml-3"
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
    <v-table v-if="allFactoryRawResources.length > 0" id="stats-raw-resources" class="stats-table" density="compact">
      <thead>
        <tr>
          <th>Resource</th>
          <th class="text-right">Extracted</th>
          <th>Extracted by</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="resource in allFactoryRawResources" :key="resource.id">
          <td>
            <v-chip class="sf-chip cyan no-margin" variant="tonal">
              <game-asset clickable :subject="resource.id" type="item" />
              <b class="ml-2">{{ getPartDisplayName(resource.id) }}</b>
            </v-chip>
          </td>
          <td class="text-right"><b>{{ formatNumber(resource.totalAmount) }}</b>/min</td>
          <td>
            <!-- One chip per factory digging it up, the same shape the collapsed card uses for
                 its exports: icon, name, its own share, and a click that goes there. A total on
                 its own says a plan is short without saying where to go and fix it. -->
            <div class="source-chips d-flex flex-wrap ga-2">
              <div
                v-for="source in resource.sources"
                :key="source.id"
                class="factory-group-chip clickable"
                @click="navigateToFactory(source.id)"
              >
                <factory-icon-display class="ml-1" :icon="source.icon" size="20" />
                <span class="mx-2"><b>{{ source.name }}</b></span>
                <!-- No item icon: the resource is named in the first column of this very row,
                     and repeating it in every chip only crowds the number out. -->
                <v-chip class="sf-chip small product">{{ formatNumber(source.amount) }}/min</v-chip>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </v-table>
    <p v-else class="text-body-1">Nothing in this plan extracts a raw resource yet.</p>
  </template>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
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
  }>()

  // Everything the plan takes out of the world, per resource, with the factories doing the taking.
  const allFactoryRawResources = computed(() => calculateTotalRawResources(props.factories))

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  // Section visibility, persisted. Hidden by default until explicitly shown.
  const hidden = ref<boolean>(localStorage.getItem('statisticsRawResourcesHidden') !== 'false')
  watch(hidden, value => {
    localStorage.setItem('statisticsRawResourcesHidden', value.toString())
  })
</script>

<style lang="scss" scoped>
// Matches the raw-resource chips below it (see sf-chip's .cyan/.raw-resource rule).
.section-icon {
  color: var(--sf-raw-resource);
}

.stats-table {
  background-color: transparent;

  // The chips column carries the width; the first two only need enough not to wrap their own
  // contents, or a plan with one long factory name squeezes the resource name onto two lines.
  th:nth-child(1),
  td:nth-child(1),
  th:nth-child(2),
  td:nth-child(2) {
    white-space: nowrap;
    width: 1%;
  }

  // v-table's default cell height assumes one line; these rows hold chips and wrap.
  td {
    padding-top: 6px !important;
    padding-bottom: 6px !important;
    height: auto !important;
  }
}
</style>
