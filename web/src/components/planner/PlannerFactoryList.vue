<template>
  <div v-show="show && factories.length > 0" class="factory-list section-links">
    <!-- Statistics jump-link with an at-a-glance power summary. -->
    <div class="mb-1 rounded factory-card" :class="{ problem: powerDeficit }">
      <v-card
        class="w-100 header list px-0 rounded-0"
        style="box-shadow: none !important;"
        @click="navigateToSection('statistics')"
      >
        <v-row class="d-flex flex-wrap ma-0 align-center">
          <v-spacer class="d-flex align-center text-body-1 pa-2">
            <i class="fas fa-chart-line mr-2" />
            <span>Statistics</span>
          </v-spacer>
          <v-col class="d-flex align-center flex-wrap justify-end ga-1 py-1 px-2" cols="auto">
            <tooltip :text="`Power generated: ${formatMw(totalPower.totalPowerProduced)}`">
              <v-chip class="sf-chip x-small no-margin generation" variant="tonal">
                <i class="fas fa-bolt mr-1" /><i class="fas fa-plus" />
                <span class="ml-1">{{ formatGw(totalPower.totalPowerProduced) }}</span>
              </v-chip>
            </tooltip>
            <tooltip :text="`Power consumed: ${formatMw(totalPower.totalPowerConsumed)}`">
              <v-chip class="sf-chip x-small no-margin consumption" variant="tonal">
                <i class="fas fa-bolt mr-1" /><i class="fas fa-minus" />
                <span class="ml-1">{{ formatGw(totalPower.totalPowerConsumed) }}</span>
              </v-chip>
            </tooltip>
            <tooltip :text="`Difference vs ${hasTarget ? 'target' : 'plan'}: ${formatMw(powerDifference)}`">
              <v-chip
                class="sf-chip x-small no-margin"
                :class="powerDeficit ? 'error' : 'success'"
                variant="tonal"
              >
                <i class="fas fa-balance-scale" />
                <span class="ml-1">{{ formatGw(powerDifference) }}</span>
                <!-- Toggled via a wrapping span: FontAwesome's SVG replacement detaches the <i>,
                     so class flips (and removal of the bare <i>) never reach the rendered icon. -->
                <span v-if="hasTarget" class="ml-1"><i class="fas fa-bullseye" /></span>
                <span v-else class="ml-1"><i class="fas fa-check-square" /></span>
              </v-chip>
            </tooltip>
          </v-col>
        </v-row>
      </v-card>
    </div>
    <!-- Factories Summary jump-link. -->
    <div class="mb-1 rounded factory-card">
      <v-card
        class="w-100 header list px-0 rounded-0"
        style="box-shadow: none !important;"
        @click="navigateToSection('factory-summary')"
      >
        <v-row class="d-flex flex-nowrap ma-0 align-center">
          <v-spacer class="d-flex align-center text-body-1 pa-2">
            <i class="fas fa-list mr-2" />
            <span>Factories Summary</span>
          </v-spacer>
          <v-col class="d-flex align-center justify-end ga-1 py-1 px-2" cols="auto">
            <tooltip text="Open fullscreen summary">
              <v-btn
                class="expand-summary-btn"
                color="primary"
                rounded="sm"
                size="x-small"
                variant="outlined"
                @click.stop="eventBus.emit('openSummaryFullscreen')"
              >
                <i class="fas fa-expand-alt" />
              </v-btn>
            </tooltip>
            <tooltip :text="`Factories in plan: ${factories.length}`">
              <v-chip class="sf-chip x-small no-margin factory" variant="tonal">
                <i class="fas fa-industry" />
                <span class="ml-1">{{ factories.length }}</span>
              </v-chip>
            </tooltip>
          </v-col>
        </v-row>
      </v-card>
    </div>
  </div>
  <draggable
    v-show="show"
    v-model="factoriesCopy"
    class="factory-list"
    item-key="id"
    @end="onDragEnd"
  >
    <template #item="{ element }">
      <div :key="element.id" class="mb-1 rounded" :class="factoryClass(element)">
        <v-card
          class="w-100 header list px-0 rounded-0 "
          style="box-shadow: none !important;"
          @click="navigateToFactory(element.id)"
        >
          <v-row class="d-flex flex-nowrap ma-0">
            <v-spacer class="d-flex align-center text-body-1 pa-2">
              <i class="fas fa-grip-lines text-grey-darken-1 mr-2" />
              <i class="fas fa-industry mr-2" />
              <span>{{ truncateFactoryName(element.name) }}</span>
            </v-spacer>
            <v-tooltip right>
              <template #activator="{ props }">
                <v-col
                  v-if="countActiveTasks(element as Factory)"
                  class="context-icon align-content-center text-center py-0 px-1"
                  cols="auto"
                  v-bind="props"
                  @click="navigateToFactory(element.id, `${element.id}-tasks`)"
                  @click.stop
                >
                  <i class="d-inline fas fa-tasks mr-1" />
                  <span>{{ countActiveTasks(element as Factory) }}</span>
                </v-col>
              </template>
              <span>Tasks: {{ countActiveTasks(element as Factory) }}</span>
            </v-tooltip>
            <v-tooltip right>
              <template #activator="{ props }">
                <v-col
                  v-if="element.notes"
                  class="context-icon align-content-center text-center py-0 px-1"
                  cols="auto"
                  v-bind="props"
                  @click="navigateToFactory(element.id, `${element.id}-notes`)"
                  @click.stop
                >
                  <i class="d-inline fas fa-sticky-note" />
                </v-col>
              </template>
              <span>See notes</span>
            </v-tooltip>
            <v-tooltip right>
              <template #activator="{ props }">
                <v-col
                  class="pa-0 ml-2 align-content-center text-center sync-state"
                  :class="syncStateClass(element)"
                  cols="auto"
                  v-bind="props"
                >
                  <div v-if="element.inSync" class="d-inline">
                    <i class="fas fa-check" />
                  </div>
                  <div v-if="element.inSync === false" class="d-inline">
                    <i class="fas fa-times" />
                  </div>
                  <div v-if="element.inSync === null" class="d-inline">
                    <i class="fas fa-question" />
                  </div>
                </v-col>
              </template>
              <span>
                {{ element.inSync === true
                  ? 'In sync with game'
                  : element.inSync === false
                    ? 'Out of sync with game'
                    : 'Game sync unknown'
                }}
              </span>
            </v-tooltip>
          </v-row>
        </v-card>
      </div>
    </template>
  </draggable>
  <v-row class="pa-0 ma-0">
    <v-col class="text-center" :class="factories.length === 0 ? 'pt-0' : 'pt-n1'">
      <v-btn
        color="primary"
        prepend-icon="fas fa-plus"
        ripple
        @click="createFactory"
      >
        Add Factory
      </v-btn>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { countActiveTasks } from '@/utils/factory-management/factory'
  import { calculateTotalPower } from '@/utils/statistics'
  import { formatGw, formatMw } from '@/utils/numberFormatter'
  import { usePowerTarget } from '@/composables/usePowerTarget'
  import draggable from 'vuedraggable'
  import eventBus from '@/utils/eventBus'

  const navigateToFactory = inject('navigateToFactory') as (id: number, subsection?: string) => void
  const navigateToSection = inject('navigateToSection') as (sectionId: string) => void

  const emit = defineEmits<{
    (event: 'createFactory'): void;
    (event: 'updateFactories', factories: Factory[]): void;
  }>()
  const compProps = defineProps<{
    factories: Factory[],
    totalFactories: number,
    loadedFrom: string
  }>()
  const show = ref(compProps.loadedFrom !== 'planner')

  // At-a-glance power figures for the Statistics jump-link. The difference is the
  // headroom vs the user's power target when one is set (bullseye icon), otherwise
  // vs the plan's own consumption (tick icon); a deficit flags the entry red.
  const totalPower = computed(() => calculateTotalPower(compProps.factories))
  const { powerTarget, hasTarget } = usePowerTarget()
  const powerDifference = computed(() => hasTarget.value
    ? totalPower.value.totalPowerProduced - powerTarget.value
    : totalPower.value.totalPowerDifference)
  const powerDeficit = computed(() => powerDifference.value < 0)

  const factoriesCopy = ref([...compProps.factories])

  watch(() => compProps.factories, factories => {
    factoriesCopy.value = [...factories]
  }, { deep: true })

  // "Cheat" here by when a load is requested we hide the list
  eventBus.on('prepareForLoad', () => {
    show.value = false
  })

  eventBus.on('incrementLoad', () => {
    show.value = true
  })

  const factoryClass = (factory: Factory) => {
    return {
      'factory-card': true,
      problem: factory.hasProblem,
      needsSync: !factory.hasProblem && factory.inSync === false,
    }
  }

  const createFactory = () => {
    emit('createFactory')
  }

  const truncateFactoryName = (name: string, limit: number = 24) => {
    return name.length > limit ? name.substring(0, limit) + '...' : name
  }

  const onDragEnd = () => {
    emit('updateFactories', factoriesCopy.value)
  }

  const syncStateClass = (factory: Factory) => {
    return {
      'bg-green-darken-2': factory.inSync,
      'bg-orange-darken-2': factory.inSync === false,
      'bg-grey-darken-2': factory.inSync === null,
    }
  }
</script>

<style lang="scss" scoped>
.factory-list {
  display: flex;
  flex-direction: column;

  .factory-card {
    .header {
      border-bottom: 0 !important;
    }
  }
}

.section-links {
  .v-card {
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: rgba(255, 255, 255, 0.08);
    }
  }

  // The bolt icons sit flush against the fixed 26px chip height, so let the chip grow
  // and breathe vertically instead.
  .sf-chip.x-small {
    height: auto !important;
    padding-top: 4px !important;
    padding-bottom: 4px !important;
  }

  // The balance-scale glyph renders visually smaller than the bolt — compensate.
  .sf-chip .fa-balance-scale {
    font-size: 14px;
  }
}

.sync-state {
  width: 30px;
  min-width: 30px;
  max-width: 30px;
  flex: 0 0 30px;
}

// Miniature of the summary header's outlined "Expand" button: sized to sit
// flush with the x-small count chip beside it in the sidebar row.
.expand-summary-btn {
  // Square, matching the rendered height of the x-small count chip beside it
  min-width: 30px;
  width: 30px;
  height: 30px;
  padding: 0;
}

.context-icon {
  color: #757575;
  transition: color 0.3s;
  &:hover {
    color: white;
  }
}

.pt-n1 {
  margin-top: -0.25rem !important;
}
</style>
