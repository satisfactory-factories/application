<template>
  <h1 class="text-h5 mb-4">
    <i class="fas fa-warehouse" />
    <span class="ml-3">Product Surplus & Deficit</span>
  </h1>
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
      <game-asset :subject="product.id" type="item" />
      <span class="ml-2">
        <b>{{ getPartDisplayName(product.id) }}</b>: {{ formatNumber(product.amountRemaining) }}/min
      </span>
    </v-chip>
  </div>
  <p v-else class="text-body-1">No Product Surplus or Deficit</p>
</template>

  <script setup lang="ts">
  import { computed } from 'vue'
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

  </script>
