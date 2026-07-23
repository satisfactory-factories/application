<template>
  <div v-show="show && factories.length > 0" class="factory-list section-links">
    <!-- Statistics jump-link with an at-a-glance power summary. -->
    <div class="mb-1 rounded factory-card" :class="{ problem: powerDeficit, 'active-view': activeFactoryId === 'statistics' }">
      <v-card
        class="w-100 header list px-0 rounded-0"
        style="box-shadow: none !important;"
        @click="navigateToSection('statistics')"
      >
        <v-row class="d-flex flex-wrap ma-0 align-center pa-2 ga-2">
          <v-spacer class="d-flex align-center text-body-1 pa-0 section-title">
            <i class="fas fa-chart-line mr-2" />
            <span>Statistics</span>
          </v-spacer>
          <v-col class="d-flex align-center flex-wrap justify-end ga-1 pa-0" cols="auto">
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
                <span v-if="hasTarget" class="ml-1"><i class="fas fa-bullseye" /></span>
                <span v-else class="ml-1"><i class="fas fa-check-square" /></span>
              </v-chip>
            </tooltip>
          </v-col>
        </v-row>
      </v-card>
    </div>
    <!-- Factories Summary jump-link. -->
    <div class="mb-1 rounded factory-card" :class="{ 'active-view': activeFactoryId === 'factory-summary' }">
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
          <v-tooltip right>
            <template #activator="{ props }">
              <v-col
                class="context-icon align-content-center text-center py-0 px-2"
                cols="auto"
                v-bind="props"
              >
                <i class="d-inline fas fa-industry mr-1" />
                <span>{{ factories.length }}</span>
              </v-col>
            </template>
            <span>Factories in plan: {{ factories.length }}</span>
          </v-tooltip>
          <!-- Sits at the row's right edge, sized like the factory rows' sync-state
               cells so the two columns line up down the sidebar. -->
          <v-tooltip right>
            <template #activator="{ props }">
              <v-col
                class="pa-0 align-self-stretch align-content-center text-center sync-state expand-summary"
                cols="auto"
                v-bind="props"
                @click.stop="eventBus.emit('openSummaryFullscreen')"
              >
                <i class="fas fa-expand-alt" />
              </v-col>
            </template>
            <span>Open fullscreen summary</span>
          </v-tooltip>
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
  import { computed, inject, ref, type Ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { countActiveTasks } from '@/utils/factory-management/factory'
  import { calculateTotalPower } from '@/utils/statistics'
  import { formatGw, formatMw } from '@/utils/numberFormatter'
  import { usePowerTarget } from '@/composables/usePowerTarget'
  import draggable from 'vuedraggable'
  import eventBus from '@/utils/eventBus'

  const navigateToFactory = inject('navigateToFactory') as (id: number, subsection?: string) => void
  const navigateToSection = inject('navigateToSection') as (sectionId: string) => void
  // Scroll-spy from Planner.vue: the factory id (or section element id, e.g.
  // 'statistics') currently under the user's eye-line.
  const activeFactoryId: Ref<number | string | null> = inject('activeFactoryId', ref<number | string | null>(null))

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

  // The copy holds the same factory objects, so name/status changes flow through them
  // reactively — it only goes stale when membership or order changes. Watching that
  // via an id fingerprint avoids a deep watch re-traversing the whole plan per flush.
  watch(() => compProps.factories.map(factory => factory.id).join('|'), () => {
    factoriesCopy.value = [...compProps.factories]
  })

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
      'active-view': factory.id === activeFactoryId.value,
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
    position: relative;

    .header {
      border-bottom: 0 !important;
    }

    // Scroll-spy indicator: a bar overlaying the card's left edge marking the
    // factory currently in view. The global .factory-card state borders are
    // 2px shorthand + !important, so a pseudo-element instead of a border.
    &::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 3px;
      // Same orange as the selected tab's slider in TabNavigation.vue
      background-color: var(--sf-power-consumption);
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
      z-index: 1;
      border-top-left-radius: 2px;
      border-bottom-left-radius: 2px;
    }

    &.active-view::before {
      opacity: 1;
    }
  }
}

.section-links {
  // Match the rendered height of the power chips beside/below the title. When title
  // and chips share a line the taller chips stretch the line box and the centred
  // text drops a few px, then pops back up once the chips wrap onto their own line —
  // pinning the title line to the chip height keeps the text still in both layouts.
  .section-title {
    min-height: 32px;
  }

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

// The summary row's expand control: shares .sync-state's fixed 30px column so it
// aligns with the factory rows' sync cells below it, and reads as clickable.
.expand-summary {
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
  // Same muted blue as the "please note" info notices (see mutedBlue in
  // colors.ts); hover snaps to the full primary blue so it reads as a button.
  background-color: var(--sf-muted-blue);

  &:hover {
    background-color: rgb(var(--v-theme-primary));
  }
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
