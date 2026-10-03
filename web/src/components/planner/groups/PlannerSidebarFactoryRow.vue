<!-- One factory in the sidebar. Lifted out of PlannerFactoryList unchanged when groups arrived,
     so every row renders identically whether it sits in a group or in Ungrouped.

     SINGLE ROOT, deliberately — the icon dialog is nested inside rather than being a sibling.
     vuedraggable switches Sortable's `draggable` option to `[data-draggable]` as soon as the
     list has a header slot (ours has the collapsed drop strip), and marks each item's root with
     that attribute. A multi-root component cannot receive a fallthrough attribute, so the mark
     was silently dropped and Sortable matched no items at all: dragging did nothing, with no
     error anywhere. -->
<template>
  <div
    class="mb-1 rounded"
    :class="rowClass"
    :data-factory-id="factory.id"
    :data-factory-name="factory.name"
    data-testid="sidebar-factory-row"
    @click.capture="flash"
  >
    <!-- No ripples anywhere in the row: opening a factory mounts it straight away, and a ripple
         would freeze part way through that. A single flash says the click landed instead, for a
         click anywhere in the row (see .flash). -->
    <v-card
      class="w-100 header list px-0 rounded-0"
      :class="{ flash: flashing }"
      :ripple="false"
      style="box-shadow: none !important;"
      @animationend.self="flashing = false"
      @click="navigateToFactory(factory.id)"
    >
      <v-row class="d-flex flex-nowrap ma-0">
        <v-spacer class="d-flex flex-column justify-center text-body-1 pa-2">
          <div class="d-flex align-center">
            <!-- Gone where drag is off (see useFactoryDrag): a grip on a row that cannot be
                 dragged is an invitation to the gesture that used to break the sidebar. -->
            <i v-if="dragEnabled" class="fas fa-grip-lines text-grey-darken-1 mr-2" />
            <factory-icon-display
              class="mr-2"
              clickable
              :icon="factory.icon"
              size="20"
              @click.stop="iconDialogOpen = true"
            />
            <span>{{ truncateFactoryName(factory.name) }}</span>
          </div>
          <factory-status-chips
            animated
            navigable
            :ripple="false"
            :statuses="statuses"
            @navigate="target => navigateToStatus(target)"
          />
        </v-spacer>
        <!-- The hints share one tooltip, mounted on the first hover: a v-tooltip per icon was four
             overlay components on every row, and the sidebar renders every factory at once. -->
        <v-col
          v-if="countActiveTasks(factory)"
          class="context-icon align-content-center text-center py-0 px-1"
          cols="auto"
          @click="navigateToFactory(factory.id, `${factory.id}-tasks`)"
          @click.stop
          @mouseenter="showHint($event, `Tasks: ${countActiveTasks(factory)}`)"
          @mouseleave="hideHint"
        >
          <i class="d-inline fas fa-tasks mr-1" />
          <span>{{ countActiveTasks(factory) }}</span>
        </v-col>
        <!-- Desynced, this stops being a plain grey counter and takes a chip's outline. Amber
             text alone left the row's only explanation of its amber border sitting in a
             tooltip; an outlined pill reads as a state the reader is meant to act on, and
             matches the amber Checklist chip on the card the row points at. -->
        <v-col
          v-if="factory.checklistEnabled"
          class="context-icon align-content-center text-center py-0 px-1"
          :class="[checklistTextClass(factory), { 'checklist-desynced': checklistDesyncCount > 0 }]"
          cols="auto"
          @click="navigateToFactory(factory.id, `${factory.id}-checklist`)"
          @click.stop
          @mouseenter="showHint($event, checklistHint)"
          @mouseleave="hideHint"
        >
          <i class="d-inline fas fa-check mr-1" />
          <span>{{ countChecklistCompleted(factory) }}/{{ countChecklistTotal(factory) }}</span>
        </v-col>
        <v-col
          v-if="factory.notes"
          class="context-icon align-content-center text-center py-0 px-1"
          cols="auto"
          @click="navigateToFactory(factory.id, `${factory.id}-notes`)"
          @click.stop
          @mouseenter="showHint($event, 'See notes')"
          @mouseleave="hideHint"
        >
          <i class="d-inline fas fa-sticky-note" />
        </v-col>
        <v-col
          class="pa-0 ml-2 align-content-center text-center sync-state"
          :class="syncStateClass"
          cols="auto"
          @mouseenter="showHint($event, syncHint)"
          @mouseleave="hideHint"
        >
          <div v-if="factory.inSync" class="d-inline">
            <i class="fas fa-check" />
          </div>
          <div v-if="factory.inSync === false" class="d-inline">
            <i class="fas fa-times" />
          </div>
          <div v-if="factory.inSync === null" class="d-inline">
            <i class="fas fa-question" />
          </div>
        </v-col>
      </v-row>
    </v-card>
    <v-tooltip
      v-if="hintTarget"
      v-model="hintOpen"
      location="right"
      :open-on-focus="false"
      :open-on-hover="false"
      :target="hintTarget"
    >
      {{ hintText }}
    </v-tooltip>
    <factory-icon-dialog v-model="iconDialogOpen" :factory="factory" />
  </div>
</template>

<script setup lang="ts">
  import { computed, inject, nextTick, ref, type Ref } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import {
    FactoryStatus,
    factoryStatusClass,
    FactoryStatusSection,
    statusJumpTargets,
  } from '@/utils/factory-management/status'
  import { countActiveTasks } from '@/utils/factory-management/factory'
  import {
    checklistTextClass,
    countChecklistCompleted,
    countChecklistDesynced,
    countChecklistTotal,
  } from '@/utils/factory-management/checklist'
  import { useFactoryDrag } from '@/composables/useFactoryDrag'
  import FactoryStatusChips from '@/components/planner/FactoryStatusChips.vue'
  import FactoryIconDialog from '@/components/planner/FactoryIconDialog.vue'
  import FactoryIconDisplay from '@/components/planner/FactoryIconDisplay.vue'

  const props = defineProps<{
    factory: Factory
    statuses?: FactoryStatus[]
  }>()

  const navigateToFactory = inject('navigateToFactory') as (
    id: number,
    subsection?: string | string[],
    fallback?: string,
  ) => void

  // Aim at every row the status names, with its section as the fallback for anything that has no
  // row of its own (or whose card has not rendered yet).
  const navigateToStatus = (target: { section: FactoryStatusSection, subjects: string[] }) => {
    const { targets, fallback } = statusJumpTargets(props.factory.id, target)
    navigateToFactory(props.factory.id, targets, fallback)
  }
  const activeFactoryId: Ref<number | string | null> = inject('activeFactoryId', ref<number | string | null>(null))

  const { dragEnabled } = useFactoryDrag()

  const iconDialogOpen = ref(false)

  // Restarted on every click, so a second click on the same row flashes again.
  const flashing = ref(false)
  const flash = async () => {
    flashing.value = false
    await nextTick()
    flashing.value = true
  }

  const checklistDesyncCount = computed(() => countChecklistDesynced(props.factory))

  const hintTarget = ref<HTMLElement | null>(null)
  const hintText = ref('')
  const hintOpen = ref(false)
  const showHint = (event: MouseEvent, text: string) => {
    hintTarget.value = event.currentTarget as HTMLElement
    hintText.value = text
    hintOpen.value = true
  }
  const hideHint = () => {
    hintOpen.value = false
  }

  const checklistHint = computed(() => {
    const ticked = `Checklist: ${countChecklistCompleted(props.factory)}/${countChecklistTotal(props.factory)}`
    return checklistDesyncCount.value > 0
      ? `${ticked} ticked, ${checklistDesyncCount.value} of them at a number that has since changed`
      : `${ticked} complete`
  })

  const syncHint = computed(() => props.factory.inSync === true
    ? 'In sync with game'
    : props.factory.inSync === false
      ? 'Out of sync with game'
      : 'Game sync unknown')

  const rowClass = computed(() => ({
    'factory-card': true,
    'active-view': props.factory.id === activeFactoryId.value,
    ...factoryStatusClass(props.statuses),
  }))

  const syncStateClass = computed(() => ({
    'bg-green-darken-2': props.factory.inSync,
    'bg-orange-darken-2': props.factory.inSync === false,
    'bg-grey-darken-2': props.factory.inSync === null,
  }))

  const truncateFactoryName = (name: string, limit: number = 24) =>
    name.length > limit ? name.substring(0, limit) + '...' : name
</script>

<style lang="scss" scoped>
.factory-card {
  position: relative;

  .header {
    border-bottom: 0 !important;
  }

  // Scroll-spy indicator: a bar overlaying the card's left edge marking the factory
  // currently in view. The global .factory-card state borders are 2px shorthand +
  // !important, so a pseudo-element instead of a border.
  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 3px;
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

// One flash on click, on and then off with nothing in between. Opacity on a layer of its own, so
// it holds its timing even while the factory it opened is mounting.
.flash::after {
  content: '';
  position: absolute;
  inset: 0;
  background-color: white;
  opacity: 0;
  pointer-events: none;
  animation: row-flash 0.2s step-end;
  will-change: opacity;
}

@keyframes row-flash {
  0% {
    opacity: 0.18;
  }
}

.sync-state {
  width: 30px;
  min-width: 30px;
  max-width: 30px;
  flex: 0 0 30px;
}

.context-icon {
  color: #757575;
  transition: color 0.3s;

  &:hover {
    color: white;
  }

  // The chip look, borrowed from .sf-chip.status-warning rather than reaching for a v-chip: this
  // sits in a fixed-width icon strip beside the tasks and notes glyphs, and a real chip's own
  // padding and height would push that row out of line.
  &.checklist-desynced {
    align-self: center;
    background-color: var(--sf-status-warning-bg);
    border: 1px solid var(--sf-status-warning-border);
    border-radius: 4px;
    padding: 1px 6px !important;
    white-space: nowrap;

    &:hover {
      color: var(--sf-status-warning);
    }
  }
}
</style>
