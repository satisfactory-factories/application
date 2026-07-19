<template>
  <v-card class="sub-card border-md">
    <v-card-title>
      <h2 class="text-h6">
        <i class="fas fa-building" />
        <span class="ml-3">Power &amp; Buildings</span>
      </h2>
    </v-card-title>
    <v-card-text class="text-body-1 pb-2">
      <v-chip
        class="sf-chip yellow"
        variant="tonal"
      >
        <i class="fas fa-bolt" />
        <i class="fas fa-minus" />
        <span class="ml-2">
          Consumes:
          <span :id="`${factory.id}-buildings-power-consumed`">
            {{ formatPower(factory.power.consumed).value }} {{ formatPower(factory.power.consumed).unit }}
          </span>
        </span></v-chip>
      <v-chip
        class="sf-chip yellow"
        variant="tonal"
      >
        <i class="fas fa-bolt" />
        <i class="fas fa-plus" />
        <span class="ml-2">
          Produces:
          <span :id="`${factory.id}-buildings-power-produced`">
            {{ formatPower(factory.power.produced).value }} {{ formatPower(factory.power.produced).unit }}
          </span>
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
            :key="`${buildingIndex}-${buildingData.name}`"
            clickable
            :subject="buildingData.name"
            type="building"
          />
          <span class="ml-2">
            <b>{{ getBuildingDisplayName(buildingData.name) ?? 'UNKNOWN' }}</b>:
            <span
              :id="`${factory.id}-buildings-building-${buildingData.name}`"
            >
              {{ formatNumber(buildingData.amount) ?? 0 }}</span>x
          </span>
        </v-chip>
      </div>
    </v-card-text>
  </v-card>
</template>
<script setup lang="ts">
  import { formatNumber, formatPower } from '@/utils/numberFormatter'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'

  defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

</script>
