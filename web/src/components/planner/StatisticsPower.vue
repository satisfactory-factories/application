<template>
  <div class="d-flex align-center flex-wrap ga-2">
    <h4 class="text-h4">
      <i class="fas fa-power-off mr-3" />Power Consumption and Generation
    </h4>
    <v-chip
      id="stats-power-summary-generation"
      class="sf-chip generation no-margin"
      variant="tonal"
    >
      <i class="fas fa-bolt" />
      <i class="fas fa-plus" />
      <span class="ml-1">{{ mw(totalPower.totalPowerProduced) }}</span>
    </v-chip>
    <v-chip
      id="stats-power-summary-consumption"
      class="sf-chip consumption no-margin"
      variant="tonal"
    >
      <i class="fas fa-bolt" />
      <i class="fas fa-minus" />
      <span class="ml-1">{{ mw(totalPower.totalPowerConsumed) }}</span>
    </v-chip>
    <tooltip :text="hasTarget ? 'Difference vs your power target' : 'Difference vs the plan\'s consumption'">
      <v-chip
        id="stats-power-summary-difference"
        class="sf-chip no-margin"
        :class="balanceDifference >= 0 ? 'green' : 'red'"
        variant="tonal"
      >
        <i class="fas fa-balance-scale" />
        <span class="ml-1">{{ mw(balanceDifference) }}</span>
        <!-- Toggled via a wrapping span: FontAwesome's SVG replacement detaches the <i>,
             so class flips (and removal of the bare <i>) never reach the rendered icon. -->
        <span v-if="hasTarget" class="ml-2"><i class="fas fa-bullseye" /></span>
        <span v-else class="ml-2"><i class="fas fa-check-square" /></span>
      </v-chip>
    </tooltip>
  </div>
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
  <v-row class="mt-1">
    <v-col cols="12" md="8">
      <h2 class="text-h5 font-weight-bold text-no-wrap">
        <i class="fas fa-check-square mr-2" />Plan
      </h2>
      <v-table class="power-table" density="compact">
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
              <i class="fas fa-bolt mr-1" /><i class="fas fa-arrow-up mr-2" />Circuit boost
              <span class="text-no-wrap">({{ boostBreakdown }})
                <tooltip-info text="Alien Power Augmenters boost the whole grid's generation: +10% each, or +30% when injected with Alien Power Matrixes.<br>Assumes all factories are connected to one big power grid." />
              </span>
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
    </v-col>
    <v-col cols="12" md="4">
      <h2 class="text-h5 font-weight-bold text-no-wrap">
        <i class="fas fa-bullseye mr-2" />Power Target
      </h2>
      <div class="d-flex align-center">
        <v-chip class="sf-chip input no-margin" variant="tonal">
          <tooltip text="Power target">
            <i class="fas fa-bolt ml-3" />
          </tooltip>
          <v-number-input
            id="stats-power-target"
            v-model="powerTarget"
            class="inline-inputs ml-2"
            control-variant="stacked"
            density="compact"
            hide-details
            hide-spin-buttons
            :min="0"
            width="140px"
          />
          <span class="mx-2">MW</span>
        </v-chip>
        <!-- height matches the sf-chip input beside it (32px chip + its forced 20px padding) -->
        <v-btn
          id="stats-power-target-clear"
          class="ml-2"
          color="primary"
          :disabled="!hasTarget"
          height="42"
          variant="outlined"
          @click="powerTarget = 0"
        >Clear
        </v-btn>
        <tooltip-info text="When the target is cleared, the balance chips show the difference vs the plan's consumption instead of your target." />
      </div>
      <p class="text-body-2 text-medium-emphasis mt-3">
        Since not every power consumer can be represented in the plan (e.g. Trains, Lights etc), you can set your own generation
        target for the grid and see the difference versus the plan's production.
      </p>
      <v-table v-if="powerTarget > 0" class="power-table target-table mt-2" density="compact">
        <tbody>
          <tr>
            <td><i class="fas fa-bolt mr-1" /><i class="fas fa-equals mr-2" />Total generation</td>
            <td id="stats-power-target-generation" class="text-right">
              {{ mw(totalPower.totalPowerProduced) }}
            </td>
          </tr>
          <tr>
            <td><i class="fas fa-bullseye mr-2" />Target</td>
            <td class="text-right">{{ mw(powerTarget) }}</td>
          </tr>
          <tr class="font-weight-bold">
            <td><i class="fas fa-balance-scale mr-2" />Difference vs target</td>
            <td
              id="stats-power-target-difference"
              class="text-right"
              :class="{
                'text-green': targetDifference >= 0,
                'text-red': targetDifference < 0,
              }"
            >
              {{ mw(targetDifference) }}
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { calculateTotalPower } from '@/utils/statistics'
  import { formatMw, formatNumber } from '@/utils/numberFormatter'
  import { usePowerTarget } from '@/composables/usePowerTarget'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  const totalPower = computed(() => calculateTotalPower(props.factories))

  const { powerTarget, hasTarget } = usePowerTarget()
  const targetDifference = computed(() => totalPower.value.totalPowerProduced - powerTarget.value)

  // The balance chip compares against the target when one is set, otherwise
  // against the plan's own consumption — the trailing icon says which.
  const balanceDifference = computed(() =>
    hasTarget.value ? targetDifference.value : totalPower.value.totalPowerDifference,
  )

  // The game's power screens always show MW, so the table matches them exactly.
  const mw = formatMw

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
    width: 100%;
    background: transparent;

    td:first-child {
      width: 40%;
    }

    td:not(:first-child) {
      white-space: nowrap;
    }

    &.target-table td:first-child {
      width: auto;
      white-space: nowrap;
    }
  }

  // Semantic power colours — defined once in src/utils/colors.ts, published as --sf-*.
  .boost-row td {
    color: var(--sf-circuit-boost);
  }

  .generation-row td {
    color: var(--sf-power-generation);
  }

  .consumption-row td {
    color: var(--sf-power-consumption);

    // Must out-rank the row-wide colour above.
    &.max-consumption {
      color: var(--sf-peak-consumption);
    }
  }

  .max-consumption {
    color: var(--sf-peak-consumption);
  }
</style>
