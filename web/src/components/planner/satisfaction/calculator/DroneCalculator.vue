<template>
  <div class="d-flex align-center justify-center mb-4">
    <span class="mr-2">
      <v-icon icon="fas fa-drone" />
    </span>
    <v-number-input
      v-model.number="factorySettings.droneTime"
      control-variant="stacked"
      density="compact"
      hide-details
      label="Round trip secs"
      max-width="150px"
      type="number"
      variant="outlined"
    />
    <tooltip-info text="Round Trip time is calculated by riding the train and timing how long it takes to do a full round trip. Unload, load, unload aka &quot;3 choos&quot;" />
  </div>
  <div class="d-flex align-center justify-center">
    <v-chip>
      <game-asset subject="drone" type="vehicle" />
      <span class="ml-2">Drones: <b>{{ calculateDrones() }}</b></span>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
  import { ExportCalculatorFactorySettings, FactoryDependencyRequest } from '@/interfaces/planner/FactoryInterface'
  import { formatNumber } from '@/utils/numberFormatter'
  import { useGameDataStore } from '@/stores/game-data-store'
  import TooltipInfo from '@/components/tooltip-info.vue'

  const gameData = useGameDataStore().getGameData()

  const props = defineProps<{
    request: FactoryDependencyRequest
    factorySettings: ExportCalculatorFactorySettings
  }>()

  const calculateDrones = () => {
    return '1'
  }
</script>
