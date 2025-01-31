<template>
  Remaining Buildings: {{ formatNumber(remainingBuildings) }}
  <div v-for="group in product.buildingGroups" :key="group.id" class="border-t-md py-4">
    <building-group :group="group" :product="product" />
  </div>
  <v-btn color="secondary" @click="addGroup(product)"><i class="fas fa-plus" /><span class="ml-2">Add Building Group</span></v-btn>
  <tooltip-info text="Building Groups are a means to split up the number of buildings needed to create this product into sub-groups.<br>This is very useful to split buildings by a constraint (e.g. refineries for a pipe, constructors for a belt)." />
</template>

<script setup lang="ts">
  import BuildingGroup from '@/components/planner/products/BuildingGroup.vue'
  import { FactoryItem } from '@/interfaces/planner/FactoryInterface'
  import { addGroup } from '@/utils/factory-management/productBuildingGroups'
  import { formatNumber } from '@/utils/numberFormatter'

  const props = defineProps<{
    product: FactoryItem
  }>()

  const remainingBuildings = computed(() => {
    const used = props.product.buildingGroups.reduce((acc, group) => acc + group.buildingCount, 0)

    return props.product.buildingRequirements.amount - used
  })
</script>
