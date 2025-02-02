<template>
  <div v-for="group in product.buildingGroups" :key="group.id" class="border-t-md py-1">
    <building-group :factory="factory" :group="group" :product="product" />
  </div>
  <div class="d-flex align-center">
    <v-btn
      color="primary"
      size="small"
      @click="addGroup(product, false)"
    >
      <i class="fas fa-plus" />
      <span class="my-2">Add Building Group</span>
    </v-btn>
    <tooltip-info text="Building Groups are a means to split up the number of buildings needed to create this product into sub-groups.<br>This is very useful to split buildings by a constraint (e.g. refineries for a pipe, constructors for a belt)." />
    <v-btn
      class="ml-2"
      color="secondary"
      :disabled="product.buildingGroups.length === 1"
      size="small"
      @click="rebalanceGroups(product)"
    ><i class="fas fa-balance-scale" />
      <span class="ml-2">Evenly balance</span>
    </v-btn>
    <span class="ml-2">Remaining Buildings: {{ remainingBuildings }}</span>
  </div>
</template>

<script setup lang="ts">
  import BuildingGroup from '@/components/planner/products/BuildingGroup.vue'
  import { Factory, FactoryItem } from '@/interfaces/planner/FactoryInterface'
  import {
    addGroup,
    calculateEffectiveBuildingCount,
    rebalanceGroups,
  } from '@/utils/factory-management/productBuildingGroups'

  const props = defineProps<{
    factory: Factory
    product: FactoryItem
  }>()

  const remainingBuildings = calculateEffectiveBuildingCount(props.product)
</script>
