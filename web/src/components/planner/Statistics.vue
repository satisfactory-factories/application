<template>
  <v-row id="statistics">
    <v-col>
      <v-card class="factory-card">
        <v-row class="header">
          <v-col class="text-h4 flex-grow-1" cols="8">
            <i class="fas fa-chart-line" /><span class="ml-3">Statistics</span>
          </v-col>
          <v-col class="text-right" cols="4">
            <v-btn
              v-show="!hidden"
              color="primary"
              prepend-icon="fas fa-eye-slash"
              variant="flat"
              @click="toggleVisibility"
            >Hide
            </v-btn>
            <v-btn
              v-show="hidden"
              color="primary"
              prepend-icon="fas fa-eye"
              variant="outlined"
              @click="toggleVisibility"
            >Show
            </v-btn>
          </v-col>
        </v-row>
        <!-- Power gets prominence even when the statistics are collapsed: the target and
             its difference stay visible so the user always knows where they stand. -->
        <v-card-text v-if="hidden" class="text-body-1 d-flex align-center flex-wrap ga-2 py-2">
          <span class="font-weight-bold">Power Target:</span>
          <v-chip class="sf-chip input no-margin" variant="tonal">
            <tooltip text="Power target">
              <i class="fas fa-bullseye ml-3" />
            </tooltip>
            <v-number-input
              id="stats-power-target-collapsed"
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
          <v-chip class="sf-chip generation no-margin" variant="tonal">
            <i class="fas fa-bolt" />
            <i class="fas fa-plus" />
            <span id="stats-power-generated-collapsed" class="ml-2">
              Generated: {{ formatMw(totalPower.totalPowerProduced) }}
            </span>
          </v-chip>
          <v-chip class="sf-chip consumption no-margin" variant="tonal">
            <i class="fas fa-bolt" />
            <i class="fas fa-minus" />
            <span id="stats-power-consumed-collapsed" class="ml-2">
              Consumed: {{ formatMw(totalPower.totalPowerConsumed) }}
            </span>
          </v-chip>
          <tooltip :text="hasTarget ? 'Difference vs your power target' : 'Difference vs the plan\'s consumption'">
            <v-chip
              class="sf-chip no-margin"
              :class="balanceDifference >= 0 ? 'green' : 'red'"
              variant="tonal"
            >
              <i class="fas fa-balance-scale" />
              <span id="stats-power-target-difference-collapsed" class="ml-2">
                Difference vs {{ hasTarget ? 'target' : 'plan' }}: {{ formatMw(balanceDifference) }}
              </span>
              <!-- Toggled via a wrapping span: FontAwesome's SVG replacement detaches the <i>,
                   so class flips (and removal of the bare <i>) never reach the rendered icon. -->
              <span v-if="hasTarget" class="ml-2"><i class="fas fa-bullseye" /></span>
              <span v-else class="ml-2"><i class="fas fa-check-square" /></span>
            </v-chip>
          </tooltip>
        </v-card-text>
        <v-card-text v-if="!hidden" class="text-body-1">
          <statistics-power :factories="factories" :help-text="helpText" />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <statistics-resources :factories="factories" :help-text="helpText" />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <statistics-items-difference :factories="factories" :help-text="helpText" />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <statistics-shards-sloops :factories="factories" :help-text="helpText" />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <statistics-buildings :factories="factories" :help-text="helpText" />
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import {
    Factory,
  } from '@/interfaces/planner/FactoryInterface'
  import { calculateTotalPower } from '@/utils/statistics'
  import { formatMw } from '@/utils/numberFormatter'
  import { usePowerTarget } from '@/composables/usePowerTarget'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{
    factories: Factory[];
    helpText: boolean;
  }>()

  // Power strip shown while the statistics are collapsed. Its balance chip mirrors
  // the expanded section: vs target when one is set, vs the plan otherwise.
  const { powerTarget, hasTarget } = usePowerTarget()
  const totalPower = computed(() => calculateTotalPower(props.factories))
  const balanceDifference = computed(() => hasTarget.value
    ? totalPower.value.totalPowerProduced - powerTarget.value
    : totalPower.value.totalPowerDifference)

  // Default to not showing the stats on first ever load
  const statisticsHidden = localStorage.getItem('statisticsHidden') ?? 'false'

  // Initialize the 'hidden' refs based on the value in localStorage.
  // Compare against the string — Boolean('false') is true, which hid the section for fresh visitors.
  const hidden = ref<boolean>(statisticsHidden === 'true')

  // Watch the 'hidden' ref and update localStorage whenever it changes
  watch(hidden, newValue => {
    localStorage.setItem('statisticsHidden', newValue.toString())
  })

  // Function to toggle visibility
  const toggleVisibility = () => {
    hidden.value = !hidden.value
  }

  // Sidebar jump-link: landing on a collapsed section just to click Show is pointless,
  // so reveal it before the scroll arrives.
  eventBus.on('openSection', sectionId => {
    // The Mercer Sphere block is inside this section, so a jump aimed at it has to unhide the
    // whole card first or there is nothing on the page to scroll to.
    if (sectionId === 'statistics' || sectionId === 'statistics-mercer-spheres') {
      hidden.value = false
    }
  })

</script>
