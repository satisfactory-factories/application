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
          <v-spacer class="d-flex align-center text-body-1 pa-2 text-no-wrap">
            <i class="fas fa-list mr-2" />
            <span>Global Factories Summary</span>
          </v-spacer>
          <v-tooltip right>
            <template #activator="{ props }">
              <v-col
                class="factory-count align-content-center text-center py-0 px-2"
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
        <!-- The state of the plan in three numbers, on their own line the way a group's power and
             product rows are: the sidebar is narrow and drags narrower still, and beside the title
             they wrapped "Factories Summary" onto two lines instead. Only what applies is shown —
             a row of zeroes is noise on a healthy plan, and a number appearing is the whole point. -->
        <div v-if="statusTally.length" class="d-flex align-center flex-wrap ga-1 px-2 pb-2">
          <tooltip
            v-for="chip in statusTally"
            :key="chip.key"
            :text="chip.tooltip"
          >
            <v-chip class="sf-chip x-small no-margin" :class="chip.class" variant="tonal">
              <i :class="chip.icon" />
              <span class="ml-1">{{ chip.count }}</span>
            </v-chip>
          </tooltip>
        </div>
      </v-card>
    </div>
  </div>
  <div v-show="show" class="factory-list">
    <!-- Ungrouped is pinned above the groups and is not itself draggable: it is synthesised,
         not stored, so there is no group record to reorder. -->
    <planner-sidebar-group
      v-if="ungroupedSection"
      :section="ungroupedSection"
      :statuses="statuses"
      @create-factory="createFactory"
    />

    <!-- Off entirely where the pointer is coarse: the drag gesture is the scroll gesture on a
         touchscreen, so every attempt to scroll the tray reordered the plan instead. The Arrange
         dialog below is what does this there. -->
    <draggable
      :disabled="!dragEnabled"
      :group="{ name: 'sidebar-groups' }"
      handle=".group-drag-handle"
      item-key="id"
      :model-value="groupSections"
      @change="onGroupOrderChange"
      @end="draggingGroup = false"
      @start="draggingGroup = true"
    >
      <template #item="{ element }">
        <planner-sidebar-group
          :section="element"
          :statuses="statuses"
          @create-factory="createFactory"
          @delete="requestGroupDelete"
        />
      </template>
    </draggable>
  </div>

  <factory-group-create-dialog v-model="createGroupOpen" />
  <factory-arrange-dialog v-model="arrangeOpen" />
  <factory-group-bulk-dialog v-model="bulkGroupOpen" />
  <factory-group-delete-dialog v-model="deleteGroupOpen" :group="groupPendingDelete" />

  <v-row class="pa-0 ma-0">
    <v-col class="text-center d-flex flex-column align-center ga-2" :class="factories.length === 0 ? 'pt-0' : 'pt-n1'">
      <tooltip text="Add a new, empty factory to the plan, filed under no group.">
        <v-btn
          color="primary"
          prepend-icon="fas fa-plus"
          ripple
          @click="createFactory()"
        >
          Add Factory
        </v-btn>
      </tooltip>
      <!-- Group management sits on its own line under it: neither button is the thing you reach
           for most, and side by side they competed with Add Factory for the same glance. -->
      <div class="d-flex justify-center flex-wrap ga-2">
        <tooltip text="Create a new group: a folder to file factories under, so a big plan stays navigable.">
          <v-btn
            class="create-group-btn"
            color="secondary"
            prepend-icon="fas fa-folder-plus"
            ripple
            size="small"
            variant="outlined"
            @click="createGroupOpen = true"
          >
            Group
          </v-btn>
        </tooltip>
        <tooltip :text="factories.length === 0 ? 'Nothing to arrange yet — add a factory first.' : 'Reorder groups and factories, and move factories between groups, with buttons instead of dragging.'">
          <v-btn
            class="arrange-btn"
            color="secondary"
            :disabled="factories.length === 0"
            prepend-icon="fas fa-sort"
            ripple
            size="small"
            variant="outlined"
            @click="arrangeOpen = true"
          >
            Arrange
          </v-btn>
        </tooltip>
        <tooltip :text="factories.length === 0 ? 'Nothing to group yet — add a factory first.' : 'Rename, reorder and recolour every group at once, and move factories between them.'">
          <v-btn
            class="bulk-group-btn"
            color="secondary"
            :disabled="factories.length === 0"
            prepend-icon="fas fa-object-group"
            ripple
            size="small"
            variant="outlined"
            @click="bulkGroupOpen = true"
          >
            Multi-Group Edit
          </v-btn>
        </tooltip>
      </div>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
  import { computed, inject, ref, type Ref } from 'vue'
  import { Factory, FactoryGroup } from '@/interfaces/planner/FactoryInterface'
  import { calculateTotalPower } from '@/utils/statistics'
  import { formatGw, formatMw } from '@/utils/numberFormatter'
  import { usePowerTarget } from '@/composables/usePowerTarget'
  import { useFactoryGroups } from '@/composables/useFactoryGroups'
  import { useFactoryDrag } from '@/composables/useFactoryDrag'
  import { factoryStatusTallyChips, getFactoryStatuses, tallyFactoryStatuses } from '@/utils/factory-management/status'
  import PlannerSidebarGroup from '@/components/planner/groups/PlannerSidebarGroup.vue'
  import FactoryArrangeDialog from '@/components/planner/groups/FactoryArrangeDialog.vue'
  import FactoryGroupCreateDialog from '@/components/planner/groups/FactoryGroupCreateDialog.vue'
  import FactoryGroupBulkDialog from '@/components/planner/groups/FactoryGroupBulkDialog.vue'
  import FactoryGroupDeleteDialog from '@/components/planner/groups/FactoryGroupDeleteDialog.vue'
  import draggable from 'vuedraggable'
  import eventBus from '@/utils/eventBus'

  const navigateToSection = inject('navigateToSection') as (sectionId: string) => void
  // Scroll-spy from Planner.vue, used by the two jump-link cards above the factory list.
  const activeFactoryId: Ref<number | string | null> = inject('activeFactoryId', ref<number | string | null>(null))

  const emit = defineEmits<{
    // The group the new factory belongs in: an id, null for Ungrouped, or nothing at all from the
    // plan-wide button, which has no group in mind.
    (event: 'createFactory', groupId?: string | null): void;
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

  // Groups. Every mutation goes through the composable, which is the single writer — this
  // component is mounted twice at once (docked sidebar and the teleported drawer), so it must
  // not hold its own copy of the ordering. The old local `factoriesCopy` is gone for that reason.
  const { sections, setGroupOrder } = useFactoryGroups()

  // Held for the duration of a group drag so a sidebar that is only peeked out doesn't collapse
  // out from under the group being dragged. See Planner.vue's peekLocked.
  const { draggingGroup, dragEnabled } = useFactoryDrag()

  const ungroupedSection = computed(() => sections.value.find(section => !section.group))
  const groupSections = computed(() => sections.value.filter(section => section.group))

  const createGroupOpen = ref(false)
  const arrangeOpen = ref(false)
  const bulkGroupOpen = ref(false)
  const deleteGroupOpen = ref(false)
  const groupPendingDelete = ref<FactoryGroup | null>(null)

  // Always asks, empty group or not. An empty one has nothing to reassign, but deleting it was
  // still a single click on a small red button sitting next to the group's own controls.
  const requestGroupDelete = (group: FactoryGroup) => {
    groupPendingDelete.value = group
    deleteGroupOpen.value = true
  }

  const onGroupOrderChange = (event: { moved?: { newIndex: number, oldIndex: number } }) => {
    if (!event.moved) return
    const ordered = groupSections.value.map(section => section.group as FactoryGroup)
    const [group] = ordered.splice(event.moved.oldIndex, 1)
    ordered.splice(event.moved.newIndex, 0, group)
    setGroupOrder(ordered)
  }

  // "Cheat" here by when a load is requested we hide the list
  eventBus.on('prepareForLoad', () => {
    show.value = false
  })

  eventBus.on('incrementLoad', () => {
    show.value = true
  })

  // One pass over the plan rather than a call per row per chip — the sidebar renders every factory,
  // so a template-expression call would multiply the predicates by the chip count.
  const statuses = computed(() => new Map(
    compProps.factories.map(factory => [factory.id, getFactoryStatuses(factory)]),
  ))

  // Reuses the memo above rather than walking the plan a second time.
  const statusTally = computed(() => factoryStatusTallyChips(tallyFactoryStatuses(statuses.value.values())))

  const createFactory = (groupId: string | null = null) => {
    emit('createFactory', groupId)
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

// The plan's factory count, which is a fact rather than an affordance — the muted grey the
// context icons wear read as disabled next to the status chips beside it.
.factory-count {
  color: #e0e0e0;
}

.pt-n1 {
  margin-top: -0.25rem !important;
}
</style>
