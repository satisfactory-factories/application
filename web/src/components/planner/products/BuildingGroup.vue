<template>
  <div :key="group.id">
    <v-chip
      class="sf-chip orange input"
      variant="tonal"
    >
      <game-asset :subject="building" type="building" />
      <v-number-input
        v-model.number="group.buildingCount"
        class="inline-inputs ml-0"
        control-variant="stacked"
        hide-details
        hide-spin-buttons
        :min="0"
        type="number"
        width="100px"
        @input="updateGroup(group)"
      />
    </v-chip>
  </div>

</template>

<script setup lang="ts">
  import { defineProps } from 'vue'
  import { FactoryItem, ProductBuildingGroup } from '@/interfaces/planner/FactoryInterface'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{
    group: ProductBuildingGroup
    product: FactoryItem
  }>()

  const building = props.product.buildingRequirements.name

  const updateGroup = (group: ProductBuildingGroup) => {
    console.log(group.buildingCount)
    if (group.buildingCount === 0 || isNaN(group.buildingCount) || group.buildingCount === null) {
      eventBus.emit('toast', {
        message: 'Building count must be a positive number.',
        type: 'warning',
      })
      group.buildingCount = 0.1
      return
    }
    group.buildingCount = Math.max(0, group.buildingCount)
  }
</script>
