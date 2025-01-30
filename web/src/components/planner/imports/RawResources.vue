<template>
  <v-card v-if="validToDisplay" class="mb-4 border-md sub-card">
    <v-card-title>
      <i class="fas fa-hard-hat" /><span class="ml-2">Raw Resources</span>
    </v-card-title>
    <v-card-text class="text-body-2">
      <p class="mb-4">
        <i class="fas fa-info-circle" /> Raw resources (e.g. Iron Ore) aren't defined as imports. It is assumed you'll supply them sufficiently. It seemed a little pointless to force you to make a factory to input it directly into a factory.
      </p>
      <v-chip
        v-for="(resource, resourceKey) in factory.rawResources"
        :key="resourceKey"
        class="sf-chip cyan"
      >
        <game-asset :subject="resourceKey.toString() ?? 'unknown'" type="item" />
        <span class="ml-2">
          <b>{{ getPartDisplayName(resourceKey.toString()) }}</b>: {{ formatNumber(resource.amount) }}/min
        </span>
      </v-chip>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { getPartDisplayName } from '@/utils/helpers'
  import { formatNumber } from '@/utils/numberFormatter'
  import { Factory } from '@/interfaces/planner/FactoryInterface'

  const props = defineProps<{ factory: Factory }>()

  const validToDisplay = computed(() => {
    let valid = false

    if (Object.keys(props.factory.parts).length > 0) {
      // Scan all parts and if one of them has raw resources demand then it's valid to display.
      // Fixes #266.
      Object.keys(props.factory.parts).forEach(partKey => {
        const partData = props.factory.parts[partKey]
        if (partData.amountSuppliedViaRaw > 0) {
          valid = true
        }
      })
    }

    return valid
  })
</script>
