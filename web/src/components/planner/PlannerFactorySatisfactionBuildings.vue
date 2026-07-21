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
        class="sf-chip consumption"
        variant="tonal"
      >
        <i class="fas fa-bolt" />
        <i class="fas fa-minus" />
        <span class="ml-2">
          Consumes:
          <span :id="`${factory.id}-buildings-power-consumed`">
            {{ formatMw(factory.power.consumed) }}
          </span>
        </span></v-chip>
      <v-chip
        v-if="hasVariablePower"
        class="sf-chip max-consumption"
        variant="tonal"
      >
        <i class="fas fa-bolt" />
        <i class="fas fa-arrow-up" />
        <span class="ml-2">
          Max consumption:
          <span :id="`${factory.id}-buildings-power-consumed-max`">
            {{ formatMw(factory.power.consumedMax ?? 0) }}
          </span>
        </span>
        <tooltip-info text="Variable-power buildings in this factory oscillate between a minimum and maximum draw; Consumes shows the average.<br>Rather than generating for this peak, cover the average and use Power Storage (batteries) to absorb the spikes." />
      </v-chip>
      <v-chip
        class="sf-chip"
        :class="factory.power.produced > 0 ? 'green' : 'generation'"
        variant="tonal"
      >
        <i class="fas fa-bolt" />
        <i class="fas fa-plus" />
        <span class="ml-2">
          Produces:
          <span :id="`${factory.id}-buildings-power-produced`">
            {{ formatMw(factory.power.produced) }}
          </span>
        </span>
      </v-chip>
      <v-chip
        v-if="(factory.power.boostPercent ?? 0) > 0"
        class="sf-chip boost"
        variant="tonal"
      >
        <i class="fas fa-bolt" />
        <i class="fas fa-arrow-up" />
        <span class="ml-2">
          Circuit boost:
          <span :id="`${factory.id}-buildings-power-boost`">
            +{{ formatMw(factory.power.boostMw ?? 0) }} ({{ boostBreakdown }})
          </span>
        </span>
        <tooltip-info text="This factory's Alien Power Augmenters boost the whole grid: +10% of total generation each, or +30% when supplied with Alien Power Matrixes.<br>Assumes all factories are connected to one big power grid." />
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
  import { formatMw, formatNumber } from '@/utils/numberFormatter'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'

  const props = defineProps<{
    factory: Factory;
    helpText: boolean;
  }>()

  const hasVariablePower = computed(() => {
    const consumedMax = props.factory.power.consumedMax
    return consumedMax !== undefined && consumedMax !== props.factory.power.consumed
  })

  // "2 at 30%, 1 at 10%" reads far better than the summed percentage.
  const boostBreakdown = computed(() => {
    const segments: string[] = []
    const fueled = props.factory.power.boostFueledBuildings ?? 0
    const unfueled = props.factory.power.boostUnfueledBuildings ?? 0
    if (fueled > 0) {
      segments.push(`${formatNumber(fueled)} at 30%`)
    }
    if (unfueled > 0) {
      segments.push(`${formatNumber(unfueled)} at 10%`)
    }

    // Should never occur: the counts backfill on any recalculation, so their absence
    // means the plan somehow hasn't been recalculated since they were introduced.
    if (segments.length === 0) {
      return 'PLEASE RECALCULATE'
    }

    return segments.join(', ')
  })

</script>
