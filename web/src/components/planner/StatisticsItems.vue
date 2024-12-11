<template>
  <h1 class="text-h5 mb-4">
    <i class="fas fa-conveyor-belt-alt" />
    <span class="ml-3">Produced Items</span>
  </h1>
  <p v-show="helpText" class="mb-4">
    <i class="fas fa-info-circle" /> Shows all the items produced by all
    your factories.
  </p>

  <div v-if="allFactoryProducts.length > 0">
    <v-chip
      v-for="(product) in allFactoryProducts"
      :key="product.id"
      class="sf-chip"
    >
      <span class="mr-2">
        <game-asset :subject="product.id" type="item" />
      </span>
      <span>
        <b>{{ getPartDisplayName(product.id) }}</b>: {{ formatNumber(product.amountSupplied) }}/min
      </span>
    </v-chip>
  </div>
  <p v-else class="text-body-1">Awaiting Production</p>
</template>

  <script setup lang="ts">
  import { computed } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import { calculateTotalParts } from '@/utils/statistics'
  import {
    getPartDisplayName,
  } from '@/utils/helpers'
  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  // This function calculates total number of products produced
  const allFactoryProducts = computed(() => calculateTotalParts(props.factories).filter(product => product.amountSupplied > 0 && !product.isRaw
  ))
  </script>
