<template>
  Group {{ group.id }}
</template>

<script setup lang="ts">
  import { defineProps } from 'vue'
  import { ProductBuildingGroup } from '@/interfaces/planner/FactoryInterface'
  const props = defineProps<{
    group: ProductBuildingGroup
  }>()
</script>
