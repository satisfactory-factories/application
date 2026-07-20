<template>
  <h1 class="text-h5">
    <i class="fas fa-power-off mr-3" />Power Consumption and Generation
  </h1>
  <p v-show="helpText" class="mb-4">
    <i class="fas fa-info-circle mr-2" />Shows world level power consumption and generation data.
  </p>
  <v-alert
    id="stats-power-accuracy-note"
    class="mt-2 mb-2"
    density="compact"
    type="info"
    variant="tonal"
  >
    <b>Please note:</b> buildings outside of what this planner supports (e.g. Radar Towers, train stations, lights) also consume power,
    so the numbers below will never 100% match the in-game power metrics for your whole grid.
    They should however be accurate on a per-factory level (verify with a Power Switch) — provided that factory
    only contains production buildings and generators.
  </v-alert>
  <v-table class="power-table mt-2" density="compact">
    <thead>
      <tr>
        <th>Type</th>
        <th class="text-right">Average</th>
        <th class="text-right">Minimum</th>
        <th class="text-right">Maximum</th>
      </tr>
    </thead>
    <tbody>
      <tr class="generation-row">
        <td><i class="fas fa-bolt mr-1" /><i class="fas fa-plus mr-2" />Generation</td>
        <td id="stats-power-generation" class="text-right">
          {{ mw(totalPower.totalBasePower) }}
        </td>
        <td id="stats-power-generation-min" class="text-right">
          {{ mw(totalPower.totalBasePowerMin) }}
        </td>
        <td id="stats-power-generation-max" class="text-right">
          {{ mw(totalPower.totalBasePowerMax) }}
        </td>
      </tr>
      <tr v-if="hasBoost" class="boost-row">
        <td>
          <i class="fas fa-bolt mr-1" /><i class="fas fa-arrow-up mr-2" />Circuit boost ({{ boostBreakdown }})
          <tooltip-info text="Alien Power Augmenters boost the whole grid's generation: +10% each, or +30% when injected with Alien Power Matrixes.<br>Assumes all factories are connected to one big power grid." />
        </td>
        <td id="stats-power-boost" class="text-right">
          +{{ mw(totalPower.totalPowerBoost) }}
        </td>
        <td id="stats-power-boost-min" class="text-right">
          +{{ mw(totalPower.totalPowerBoostMin) }}
        </td>
        <td id="stats-power-boost-max" class="text-right">
          +{{ mw(totalPower.totalPowerBoostMax) }}
        </td>
      </tr>
      <tr v-if="hasBoost" class="font-weight-bold">
        <td><i class="fas fa-bolt mr-1" /><i class="fas fa-equals mr-2" />Total generation</td>
        <td id="stats-power-total-generation" class="text-right">
          {{ mw(totalPower.totalPowerProduced) }}
        </td>
        <td id="stats-power-total-generation-min" class="text-right">
          {{ mw(totalPower.totalPowerProducedMin) }}
        </td>
        <td id="stats-power-total-generation-max" class="text-right">
          {{ mw(totalPower.totalPowerProducedMax) }}
        </td>
      </tr>
      <tr class="consumption-row">
        <td><i class="fas fa-bolt mr-1" /><i class="fas fa-minus mr-2" />Consumption</td>
        <td id="stats-power-consumption" class="text-right">
          {{ mw(totalPower.totalPowerConsumed) }}
        </td>
        <td id="stats-power-consumption-min" class="text-right">
          {{ mw(totalPower.totalPowerConsumedMin) }}
        </td>
        <td id="stats-power-consumption-max" class="text-right max-consumption">
          {{ mw(totalPower.totalPowerConsumedMax) }}
        </td>
      </tr>
      <tr class="font-weight-bold">
        <td><i class="fas fa-balance-scale mr-2" />Difference<span v-if="hasVariance">&nbsp;*</span></td>
        <td
          id="stats-power-difference"
          class="text-right"
          :class="{
            'text-green': totalPower.totalPowerDifference > 0,
            'text-red': totalPower.totalPowerDifference < 0,
          }"
        >
          {{ mw(totalPower.totalPowerDifference) }}
        </td>
        <td class="text-right text-medium-emphasis">—</td>
        <td class="text-right text-medium-emphasis">—</td>
      </tr>
    </tbody>
  </v-table>
  <p v-if="hasVariance" id="stats-power-advisory" class="text-body-2 text-medium-emphasis mt-2">
    * The difference takes the averages.
    <template v-if="hasVariableConsumption">
      You should use Power Storage (batteries) to ensure you have coverage up to the
      <span class="max-consumption">maximum consumption</span> ({{ mw(totalPower.totalPowerConsumedMax) }}),
      rather than generating for the peak.
    </template>
    <template v-else>
      Variable generators (e.g. Geothermal) swing between the minimum and maximum —
      use Power Storage (batteries) to smooth out the dips.
    </template>
  </p>
</template>

<script setup lang="ts">
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { calculateTotalPower } from '@/utils/statistics'
  import { formatNumber } from '@/utils/numberFormatter'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  const totalPower = computed(() => calculateTotalPower(props.factories))

  // The game's power screens always show MW with thousands separators (e.g. "5,100 MW"),
  // so the table matches that exactly rather than converting to GW. The non-breaking
  // space stops the value wrapping onto a new line before the unit.
  const mw = (value: number) => {
    return `${Number(formatNumber(value, 1)).toLocaleString('en-US')}\u00A0MW`
  }

  const hasBoost = computed(() => totalPower.value.totalPowerBoost > 0)
  const hasVariableConsumption = computed(() => totalPower.value.totalPowerConsumedMax > totalPower.value.totalPowerConsumed)
  const hasVariance = computed(() =>
    hasVariableConsumption.value ||
    totalPower.value.totalBasePowerMax > totalPower.value.totalBasePower,
  )

  // Each augmenter contributes its own rate, so "2 at 30%, 1 at 10%" reads far better
  // than the technically-correct-but-weird summed percentage.
  const boostBreakdown = computed(() => {
    const segments: string[] = []
    if (totalPower.value.totalBoostFueled > 0) {
      segments.push(`${formatNumber(totalPower.value.totalBoostFueled)} at 30%`)
    }
    if (totalPower.value.totalBoostUnfueled > 0) {
      segments.push(`${formatNumber(totalPower.value.totalBoostUnfueled)} at 10%`)
    }

    // Should never occur: the counts backfill on any recalculation, so their absence
    // means the plan somehow hasn't been recalculated since they were introduced.
    if (segments.length === 0) {
      return 'PLEASE RECALCULATE'
    }

    return segments.join(', ')
  })
</script>

<style scoped lang="scss">
  .power-table {
    max-width: 800px;
    background: transparent;

    td:first-child {
      width: 40%;
    }

    td:not(:first-child) {
      white-space: nowrap;
    }
  }

  // The circuit boost brand colour, used wherever the boost is represented.
  .boost-row td {
    color: #9f6d9f;
  }

  .generation-row td {
    color: #9e9e9e;
  }

  .consumption-row td {
    color: #e59344;

    // Must out-rank the row-wide colour above.
    &.max-consumption {
      color: #5cb0c5;
    }
  }

  .max-consumption {
    color: #5cb0c5;
  }
</style>
