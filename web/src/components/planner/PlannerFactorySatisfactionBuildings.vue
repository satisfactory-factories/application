<template>
  <v-card class="sub-card border-md">
    <v-card-title>
      <h2 class="text-h6 mr-3" style="display: inline">
        <i class="fas fa-building" />
        <span class="ml-3">Power &amp; Buildings</span>
      </h2>
      <v-btn
        v-if="!hasSinks"
        color="orange mr-2"
        prepend-icon="fas fa-cube"
        ripple
        variant="flat"
        @click="addSinkBuildingRequirement()"
      >
        Add Sink
      </v-btn>
    </v-card-title>
    <v-card-text class="text-body-1 pb-2">
      <v-chip
        class="sf-chip yellow"
        variant="tonal"
      >
        <i class="fas fa-bolt" />
        <span class="ml-2">
          {{ formatNumber(factory.totalPower) }} MW
        </span>
      </v-chip>
      <div
        v-for="([, buildingData], buildingIndex) in Object.entries(factory.buildingRequirements)"
        :key="'building-' + buildingIndex"
        style="display: inline;"
      >
        <v-chip
          class="sf-chip orange"
          variant="tonal"
        >
          <game-asset
            :subject="buildingData.name"
            type="building"
          />
          <span class="ml-2">
            <b>{{ getBuildingDisplayName(buildingData.name) ?? 'UNKNOWN' }}</b>: {{ formatNumber(buildingData.amount) ?? 0 }}x
          </span>
        </v-chip>

      </div>
    </v-card-text>
  </v-card>
</template>
<script setup lang="ts">
  import { formatNumber } from '@/utils/numberFormatter'
  import { inject } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { useGameDataStore } from '@/stores/game-data-store'

  const updateFactory = inject('updateFactory') as (factory: Factory) => void

  const gameDataStore = useGameDataStore()

  const hasSinks = computed(() => props.factory.buildingRequirements && props.factory.buildingRequirements.resourcesink)

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const getBuildingDisplayName = inject('getBuildingDisplayName') as (part: string) => string

  const addSinkBuildingRequirement = () => {
    console.log('hasSinks')
    console.log(hasSinks.value)

    const amount = 1
    const buildingPower = gameDataStore.getGameData().buildings.resourcesink

    console.log('Found Building')
    console.log(buildingPower)

    if (!props.factory.buildingRequirements.resourcesink) {
      console.log('New Sink needed!')

      props.factory.buildingRequirements.resourcesink = {
        name: 'resourcesink',
        amount,
        powerPerBuilding: buildingPower,
        totalPower: buildingPower * amount,
      }
    }

    console.log('Added Building!')
    console.log(props.factory.buildingRequirements.resourcesink)

    console.log('hasSinks')
    console.log(hasSinks.value)

    updateFactory(props.factory)
  }

</script>
