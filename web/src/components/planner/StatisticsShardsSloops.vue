<template>
  <div class="d-flex align-center">
    <!-- Each icon next to the words it belongs to, rather than both stacked in front of the title
         where neither says which is which. -->
    <h4 class="text-h4 d-flex align-center ga-1 flex-wrap">
      <game-asset height="32" subject="power-shard" type="item_id" width="32" />
      <span class="ml-2 mr-2">Power Shards,</span>
      <game-asset height="32" subject="somersloop" type="item_id" width="32" />
      <span class="ml-2 mr-2">Somersloops &amp;</span>
      <game-asset height="32" subject="mercer-sphere" type="item_id" width="32" />
      <span class="ml-2">Mercer Spheres</span>
    </h4>
    <v-chip
      v-for="(section, index) in summarySections"
      :id="`stats-${section.key}-summary`"
      :key="`${section.key}-summary`"
      class="sf-chip small"
      :class="[section.chipClass, { 'ml-3': index === 0 }]"
      variant="tonal"
    >
      <game-asset
        height="20"
        :subject="section.icon"
        type="item_id"
        width="20"
      />
      <span class="ml-2">{{ formatNumber(section.total) }}</span>
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
      <i class="fas fa-info-circle" /> Shows which factories use Power Shards and Somersloops in their building
      groups, and which spend Mercer Spheres on Dimensional Depot Uploaders.
    </p>
    <v-row id="stats-shards-sloops" class="mt-1">
      <v-col
        v-for="section in sections"
        :key="section.key"
        cols="12"
        md="4"
      >
        <div class="usage-block mx-auto">
          <h2 class="text-subtitle-1 font-weight-bold d-flex align-center justify-center">
            <game-asset
              height="20"
              :subject="section.icon"
              type="item_id"
              width="20"
            />
            <span class="ml-2">{{ section.title }}</span>
          </h2>
          <v-table v-if="section.entries.length > 0" class="usage-table" density="compact">
            <thead>
              <tr>
                <th>Factory</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="entry in section.entries"
                :key="`${section.key}-${entry.factory.id}`"
                class="hover"
                @click="navigateToFactory(entry.factory.id)"
              >
                <td>
                  <v-chip class="sf-chip small factory">
                    <i class="fas fa-industry" />
                    <b class="ml-2">{{ entry.factory.name }}</b>
                  </v-chip>
                </td>
                <td class="text-right"><b>{{ formatNumber(entry.amount) }}</b></td>
              </tr>
            </tbody>
            <tfoot>
              <tr :id="`stats-${section.key}-total`" class="total-row">
                <td><b>Total</b></td>
                <td class="text-right"><b>{{ formatNumber(section.total) }}</b></td>
              </tr>
            </tfoot>
          </v-table>
          <p v-else class="text-body-1 text-center">{{ section.empty }}</p>
        </div>
      </v-col>
    </v-row>
  </template>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import {
    calculateFactoriesUsing,
    getFactoryPowerShards,
    getFactorySomersloops,
  } from '@/utils/statistics'
  import { getFactoryMercerSpheres } from '@/utils/factory-management/disposal'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  const navigateToFactory = inject('navigateToFactory') as (id: string | number) => void

  const sumAmounts = (entries: { amount: number }[]) => entries.reduce((total, entry) => total + entry.amount, 0)

  const sections = computed(() => {
    const shards = calculateFactoriesUsing(props.factories, getFactoryPowerShards)
    const sloops = calculateFactoriesUsing(props.factories, getFactorySomersloops)
    // One per Dimensional Depot Uploader placed in the Storage column of a factory's Satisfaction.
    // The MAM research spheres are a once-per-save cost and are stated in the Dimensional Depot
    // section instead — charging them to a plan would have every plan in a save claim them.
    const spheres = calculateFactoriesUsing(props.factories, getFactoryMercerSpheres)
    return [
      {
        key: 'shards',
        title: 'Power Shards',
        icon: 'power-shard',
        chipClass: 'yellow',
        empty: 'No Power Shards used in this plan.',
        entries: shards,
        total: sumAmounts(shards),
      },
      {
        key: 'sloops',
        title: 'Somersloops',
        icon: 'somersloop',
        chipClass: 'somersloop',
        empty: 'No Somersloops used in this plan.',
        entries: sloops,
        total: sumAmounts(sloops),
      },
      {
        key: 'mercer',
        title: 'Mercer Spheres',
        icon: 'mercer-sphere',
        chipClass: 'dimensional-depot',
        empty: 'No Dimensional Depot Uploaders in this plan.',
        entries: spheres,
        total: sumAmounts(spheres),
      },
    ]
  })

  // Header at-a-glance totals — only for whichever of the three is actually in use.
  const summarySections = computed(() => sections.value.filter(section => section.total > 0))

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('statisticsShardsSloopsHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('statisticsShardsSloopsHidden', value.toString())
  })
</script>

<style lang="scss" scoped>
.usage-block {
  max-width: 420px;
}

.usage-table {
  background-color: transparent;

  tbody tr.hover {
    cursor: pointer;

    &:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }
  }

  tfoot .total-row td {
    border-top: 2px solid rgba(255, 255, 255, 0.24);
  }
}
</style>
