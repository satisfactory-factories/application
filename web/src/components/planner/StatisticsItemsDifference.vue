<template>
  <div class="d-flex align-center">
    <h4 class="text-h4">
      <i class="fas fa-warehouse" />
      <span class="ml-3">Product Surplus & Deficit</span>
    </h4>
    <v-chip
      v-if="surplusCount > 0"
      id="stats-surplus-summary"
      class="sf-chip green ml-3"
      variant="tonal"
    >
      {{ surplusCount }} in surplus
    </v-chip>
    <v-chip
      v-if="deficitCount > 0"
      id="stats-deficit-summary"
      class="sf-chip red"
      :class="{ 'ml-3': surplusCount === 0 }"
      variant="tonal"
    >
      {{ deficitCount }} in deficit
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
      <i class="fas fa-info-circle" /> Shows the amount of surplus or
      deficit of items you have in your factory. These are items that
      either need to be produced more (in red), or items that can be
      stored or sunk (in green)!
    </p>
    <div v-if="factoryProductDifferences.length > 0">
      <v-chip
        v-for="(product) in factoryProductDifferences"
        :key="product.id"
        class="sf-chip"
        :class="{
          'green': product.amountRemaining > 0,
          'red': product.amountRemaining < 0,
        }"
      >
        <game-asset clickable :subject="product.id" type="item" />
        <span class="ml-2">
          <b>{{ getPartDisplayName(product.id) }}</b>: {{ formatNumber(product.amountRemaining) }}/min
        </span>
      </v-chip>
    </div>
    <p v-else class="text-body-1">No Product Surplus or Deficit</p>
  </template>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import {
    getPartDisplayName,
  } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { calculateTotalParts } from '@/utils/statistics'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  // This function calculates total number of products produced and gets the difference between demand and supply (to see if we have a surplus of products or not)
  const factoryProductDifferences = computed(() => calculateTotalParts(props.factories).filter(product => product.amountRemaining !== 0))

  // Header at-a-glance counts, shown whether the section is open or collapsed.
  const surplusCount = computed(() => factoryProductDifferences.value.filter(product => product.amountRemaining > 0).length)
  const deficitCount = computed(() => factoryProductDifferences.value.filter(product => product.amountRemaining < 0).length)

  // Section visibility, persisted. Compare against the string — Boolean('false') is true.
  const hidden = ref<boolean>(localStorage.getItem('statisticsSurplusHidden') === 'true')
  watch(hidden, value => {
    localStorage.setItem('statisticsSurplusHidden', value.toString())
  })
</script>
