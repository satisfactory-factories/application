<template>
  <v-row>
    <v-col>
      <v-card :id="factory.id" :class="cardClass" :style="groupStyle">
        <v-row class="header">
          <v-col class="flex-grow-1" cols="auto" md="8">
            <div class="text-h4 text-md-h5 d-flex align-center">
              <factory-icon-display
                clickable
                :icon="factory.icon"
                size="32"
                @click="iconDialogOpen = true"
              />
              <factory-group-tray :factory="factory" />
              <input
                v-model="draftName"
                class="ml-3 pl-0 factory-name"
                placeholder="Factory Name"
                @blur="commitName"
                @focus="nameFocused = true"
                @keyup.enter="acceptName"
              >
            </div>
            <factory-icon-dialog v-model="iconDialogOpen" :factory="factory" />
            <!-- chips bar -->
            <div class="d-flex align-center flex-wrap mt-1 ga-2">
              <!-- status chips: what is wrong, ahead of everything descriptive. outOfSync is
                   excluded because the sync chip further down this same bar already says it,
                   with help text and a reset button the status chip cannot offer. -->
              <factory-status-chips
                navigable
                size="small"
                :statuses="cardStatuses"
                @navigate="target => navigateToStatus(target)"
              />
              <!-- tasks chip -->
              <div v-if="countActiveTasks(factory)">
                <v-chip class="sf-chip sf-chip-clickable small blue no-margin" @click="navigateToFactory(factory.id, `${factory.id}-tasks`)">
                  <i class="fas fa-tasks" />
                  <span class="ml-2">Tasks: {{ countActiveTasks(factory) }}</span>
                </v-chip>
              </div>
              <!-- notes chip -->
              <div v-if="factory.notes">
                <v-chip class="sf-chip sf-chip-clickable small blue no-margin" @click="navigateToFactory(factory.id, `${factory.id}-notes`)">
                  <i class="fas fa-sticky-note" />
                  <span class="ml-2">See notes</span>
                </v-chip>
              </div>
              <!-- sync status chip -->
              <div v-if="factory.inSync">
                <v-chip class="sf-chip sf-chip-clickable small green no-margin sync-chip" @click="markInSync(factory)">
                  <i class="fas fa-check-square" />
                  <span class="ml-2">In sync with game</span>
                  <tooltip-info :text="gameSyncHelpText" @click.stop />
                  <v-btn
                    class="ml-2"
                    icon
                    size="x-small"
                    title="Reset sync status"
                    @click.stop="resetSyncState(factory)"
                  >
                    <i class="fas fa-times" />
                  </v-btn>
                </v-chip>
              </div>
              <div v-if="factory.inSync === false">
                <v-chip class="sf-chip sf-chip-clickable small status-warning-outlined no-margin sync-chip" @click="markInSync(factory)">
                  <i class="fas fa-times-square" />
                  <span class="ml-2">Out of sync with game</span>
                  <tooltip-info :text="gameSyncHelpText" @click.stop />
                  <v-btn
                    class="ml-2"
                    icon
                    size="x-small"
                    title="Reset sync status"
                    @click.stop="resetSyncState(factory)"
                  >
                    <i class="fas fa-times" />
                  </v-btn>
                </v-chip>
              </div>
              <div v-if="factory.inSync === null">
                <v-chip class="sf-chip-clickable border border-gray border-dashed" :disabled="!validForGameSync(factory)" @click="markInSync(factory)">
                  <i class="fas fa-question" />
                  <span class="ml-2">Mark as in sync with game</span>
                  <tooltip-info :text="gameSyncHelpText" @click.stop />
                </v-chip>
              </div>
              <!-- checklist progress chip -->
              <div v-if="factory.checklistEnabled">
                <v-chip
                  class="sf-chip sf-chip-clickable small no-margin"
                  :class="checklistChipClass(factory)"
                  :title="checklistChipTitle"
                  @click="navigateToFactory(factory.id, `${factory.id}-checklist`)"
                >
                  <i class="fas fa-check" />
                  <span class="ml-2">Checklist: {{ countChecklistCompleted(factory) }}/{{ countChecklistTotal(factory) }}</span>
                  <!-- The count, not the bare word "desynced": a collapsed card is often all the
                       player sees of a factory, and one stale row is a very different afternoon
                       from nine. What each one actually changed is on the rows themselves. -->
                  <span v-if="checklistDesyncCount > 0" class="ml-2">
                    &middot; {{ checklistDesyncCount }} to reconfirm
                  </span>
                </v-chip>
              </div>
              <!-- power difference chip -->
              <tooltip
                v-if="factoryPowerDifference !== 0"
                :text="`Power difference: generates ${formatMw(factory.power?.produced ?? 0)}, consumes ${formatMw(factory.power?.consumed ?? 0)}`"
              >
                <v-chip
                  class="sf-chip sf-chip-info small no-margin"
                  :class="factoryPowerDifference > 0 ? 'green' : 'consumption'"
                >
                  <i class="fas fa-bolt" />
                  <i class="fas" :class="factoryPowerDifference > 0 ? 'fa-plus' : 'fa-minus'" />
                  <span class="ml-2">{{ powerDiffDisplay }}</span>
                </v-chip>
              </tooltip>
              <!-- circuit boost chip. Its own chip because it is not this factory's power: an
                   augmenter adds a percentage of the WHOLE plan's generation, so a factory
                   generating nothing can still be why the plan's total is far above the sum of
                   the generators you can see. -->
              <tooltip
                v-if="factoryBoost > 0"
                :text="`Alien Power Augmenters here add ${formatMw(factoryBoost)} to the grid, ${boostPercentDisplay} of the plan's total generation. It is counted in the plan's power, not this factory's.`"
              >
                <v-chip class="sf-chip sf-chip-info small circuit-boost no-margin">
                  <i class="fas fa-bolt" /><i class="fas fa-arrow-up" />
                  <span class="ml-2">{{ formatMw(factoryBoost) }}</span>
                </v-chip>
              </tooltip>
              <!-- power shards chip -->
              <tooltip v-if="factoryPowerShards > 0" text="Power Shards needed by this factory">
                <v-chip class="sf-chip sf-chip-info small yellow no-margin">
                  <game-asset height="18" subject="power-shard" type="item_id" width="18" />
                  <span class="ml-2">{{ factoryPowerShards }}</span>
                </v-chip>
              </tooltip>
              <!-- somersloops chip -->
              <tooltip v-if="factorySomersloops > 0" text="Somersloops used by this factory">
                <v-chip class="sf-chip sf-chip-info small sloop no-margin">
                  <game-asset height="18" subject="somersloop" type="item_id" width="18" />
                  <span class="ml-2">{{ factorySomersloops }}</span>
                </v-chip>
              </tooltip>
            </div>
          </v-col>
          <v-col class="text-right pt-0 pt-md-3" cols="auto" md="4">
            <factory-debug :is-compact="smAndDown" :subject="factory" subject-type="Factory" />
            <v-btn
              class="mr-2 rounded"
              :color="atGroupStart ? 'grey-darken-3' : 'primary'"
              :disabled="atGroupStart"
              icon="fas fa-arrow-up"
              size="small"
              :title="atGroupStart ? 'Already first in its group' : 'Move Factory Up'"
              variant="outlined"
              @click="moveFactory(factory, 'up')"
            />
            <v-btn
              class="mr-2 rounded"
              :color="atGroupEnd ? 'grey-darken-3' : 'primary'"
              :disabled="atGroupEnd"
              icon="fas fa-arrow-down"
              size="small"
              :title="atGroupEnd ? 'Already last in its group' : 'Move Factory Down'"
              variant="outlined"
              @click="moveFactory(factory, 'down')"
            />
            <v-btn
              class="mr-2"
              color="orange rounded"
              icon="fas fa-copy"
              size="small"
              title="Copy Factory"
              variant="outlined"
              @click="copyFactory(factory)"
            />
            <v-btn
              color="red rounded"
              icon="fas fa-trash"
              size="small"
              title="Delete Factory"
              variant="outlined"
              @click="confirmDelete() && deleteFactory(factory)"
            />
            <!-- Checklist toggle sits directly under the action buttons above, rather than in the
                 chips bar on the left: it is a mode switch for the whole card, not a status. -->
            <v-tooltip location="top" max-width="360">
              <template #activator="{ props: tooltipProps }">
                <div v-bind="tooltipProps" class="d-flex justify-end mt-2">
                  <v-switch
                    :id="`${factory.id}-checklist-toggle`"
                    color="primary"
                    density="compact"
                    hide-details
                    label="Checklist"
                    :model-value="factory.checklistEnabled"
                    @update:model-value="value => toggleChecklist(!!value)"
                  />
                </div>
              </template>
              <span>
                Turn this on to get a checklist of everything this factory needs to build:
                assemblers for each product, generators for power, a source for each import and
                infrastructure for each export. Tick items off as you build them to track your own
                progress. If a ticked item's numbers change later, it stays checked but is flagged
                as desynced, so you can see exactly what changed.
              </span>
            </v-tooltip>
          </v-col>
        </v-row>
        <v-card-text>
          <template v-if="factory.checklistEnabled">
            <planner-factory-checklist :id="`${factory.id}-checklist`" :factory="factory" />
            <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          </template>
          <products-and-power
            :id="`${factory.id}-products`"
            :factory="factory"
            :statuses="statuses"
          />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <factory-imports
            :id="`${factory.id}-imports`"
            :factory="factory"
            :statuses="statuses"
          />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <planner-factory-satisfaction
            :id="`${factory.id}-satisfaction`"
            :factory="factory"
            :statuses="statuses"
          />
          <v-divider class="my-4 mx-n4" color="white" thickness="5px" />
          <v-row>
            <v-col cols="12" md="6">
              <planner-factory-tasks
                :id="`${factory.id}-tasks`"
                :factory="factory"
              />
            </v-col>
            <v-col cols="12" md="6">
              <planner-factory-notes
                :id="`${factory.id}-notes`"
                :factory="factory"
              />
            </v-col>
          </v-row>
        </v-card-text>

      </v-card>
    </v-col>
  </v-row>
  <!-- Same orange as the sidebar's active-factory indicator and the selected tab slider. -->
  <v-divider class="my-6 factory-divider" thickness="5px" />
</template>

<script setup lang="ts">
  import { computed, inject, ref, watch } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { countActiveTasks, factoryPositionInGroup } from '@/utils/factory-management/factory'
  import {
    checklistChipClass,
    countChecklistCompleted,
    countChecklistDesynced,
    countChecklistTotal,
    setChecklistEnabled,
  } from '@/utils/factory-management/checklist'
  import { useAppStore } from '@/stores/app-store'
  import { getFactoryPowerShards, getFactorySomersloops } from '@/utils/statistics'
  import { formatMw, formatNumber } from '@/utils/numberFormatter'
  import { useDisplay } from 'vuetify'
  import { setSyncState } from '@/utils/factory-management/syncState'
  import { markFactoryEdited } from '@/utils/sync-intent'
  import {
    factoryStatusClass,
    FactoryStatusSection,
    getFactoryStatuses,
    statusJumpTargets,
  } from '@/utils/factory-management/status'
  import FactoryStatusChips from '@/components/planner/FactoryStatusChips.vue'
  import FactoryGroupTray from '@/components/planner/groups/FactoryGroupTray.vue'
  import PlannerFactoryChecklist from '@/components/planner/PlannerFactoryChecklist.vue'
  import { groupColorVars } from '@/utils/colors'
  import eventBus from '@/utils/eventBus'

  const copyFactory = inject('copyFactory') as (factory: Factory) => void
  const deleteFactory = inject('deleteFactory') as (factory: Factory) => void
  const moveFactory = inject('moveFactory') as (factory: Factory, direction: string) => void
  const navigateToFactory = inject('navigateToFactory') as (
    id: string | number,
    subsection?: string | string[],
    fallback?: string,
  ) => void

  // Aim at every row the status names, with its section as the fallback for anything that has no
  // row of its own.
  const navigateToStatus = (target: { section: FactoryStatusSection, subjects: string[] }) => {
    const { targets, fallback } = statusJumpTargets(props.factory.id, target)
    navigateToFactory(props.factory.id, targets, fallback)
  }

  const props = defineProps<{
    factory: Factory
    totalFactories: number;
  }>()

  const { getFactories } = useAppStore()

  const { smAndDown } = useDisplay()

  const iconDialogOpen = ref(false)

  // The name is held as a draft while typing: writing each keystroke into the factory re-rendered
  // every place the name appears, which read as lag. Blur or Enter is what applies it.
  const draftName = ref(props.factory.name)
  const nameFocused = ref(false)
  // A remote apply must not clobber a draft mid-typing; blur commits, and the
  // user's committed name then wins the same way any content edit does.
  watch(() => props.factory.name, name => {
    if (!nameFocused.value) draftName.value = name
  })

  // The write is here rather than on each keystroke, so this is also where the rename is
  // declared: intent, not just payload, or a rebase would take the server's name back.
  // Written through the live record: a rebase can replace the factory object between
  // the keystroke and the commit, and a rename on the detached copy never syncs.
  const commitName = () => {
    nameFocused.value = false
    if (draftName.value === props.factory.name) return
    const live = getFactories().find(entry => entry.id === props.factory.id) ?? props.factory
    live.name = draftName.value
    props.factory.name = draftName.value
    markFactoryEdited(live)
  }

  // Enter accepts the rename and leaves the field, matching the group name in the sidebar.
  const acceptName = (event: KeyboardEvent) => {
    commitName()
    ;(event.target as HTMLInputElement).blur()
  }

  // Up/down move a factory within its own group, so the buttons disable at the group's edges
  // rather than the plan's. Keyed on global position they sat enabled at every group boundary
  // and did nothing when pressed.
  const groupPosition = computed(() => factoryPositionInGroup(props.factory, getFactories()))
  const atGroupStart = computed(() => groupPosition.value.index <= 0)
  const atGroupEnd = computed(() => groupPosition.value.index === groupPosition.value.total - 1)

  const gameSyncHelpText = 'Game Sync is when you have implemented the factory inside the game.<br> When it drops out of sync, there are changes that you need to implement.<br> When a factory\'s products are changed, the factory will be out of sync, or if you set it manually.'

  // Header chips: net power and total somersloops / power shards across the whole
  // factory (products + power producers).
  const checklistDesyncCount = computed(() => countChecklistDesynced(props.factory))

  // The card's chip is often read collapsed, with the checklist panel out of sight, so the hover
  // has to carry both the problem and where to go for the detail.
  const checklistChipTitle = computed(() => {
    const count = checklistDesyncCount.value
    if (count === 0) return 'Open this factory\'s checklist'
    return `${count} ticked ${count === 1 ? 'item was' : 'items were'} built to a number the plan ` +
      'has since changed. Open the checklist to see what changed on each.'
  })

  const factoryPowerDifference = computed(() =>
    (props.factory.power?.produced ?? 0) - (props.factory.power?.consumed ?? 0),
  )

  // Sign is conveyed by the chip's plus/minus icon, so display the magnitude only.
  const powerDiffDisplay = computed(() => formatMw(Math.abs(factoryPowerDifference.value)))

  // What this factory's augmenters add to the grid, and the share of the plan's generation that
  // represents — the number that makes a 61 GW group read as 251 GW on the plan.
  const factoryBoost = computed(() => props.factory.power?.boostMw ?? 0)
  const boostPercentDisplay = computed(() =>
    `${formatNumber((props.factory.power?.boostPercent ?? 0) * 100)}%`,
  )

  const factoryPowerShards = computed(() => getFactoryPowerShards(props.factory))
  const factorySomersloops = computed(() => getFactorySomersloops(props.factory))

  // Derived once here and passed down, rather than each section header calling the helper itself:
  // that would run the predicates three more times per expanded card.
  const statuses = computed(() => getFactoryStatuses(props.factory))

  const cardStatuses = computed(() => statuses.value.filter(status => status.type !== 'outOfSync'))

  const cardClass = computed(() => ({
    'factory-card': true,
    grouped: !!props.factory.group,
    ...factoryStatusClass(statuses.value),
  }))

  // Per-group data, so custom properties rather than a class — there is no fixed set of colours
  // to write rules for.
  const groupStyle = computed(() =>
    props.factory.group ? groupColorVars(props.factory.group.color) : undefined
  )

  const confirmDelete = (message = 'Are you sure you want to delete this factory?') => {
    return confirm(message)
  }

  const validForGameSync = (factory: Factory): boolean => {
    return (factory.products.length > 0 && factory.products[0]?.recipe !== '') ||
      (factory.powerProducers.length > 0 && factory.powerProducers[0]?.building !== '') ||
      // A portal room makes nothing and generates nothing, and is still a thing you built.
      ((factory.customBuildings?.length ?? 0) > 0 && factory.customBuildings[0]?.building !== '')
  }

  // Every handler below writes a field the plan persists and the room syncs, so each one
  // declares intent as well as payload — a rebase carries over only what the user touched.
  const markInSync = (factory: Factory) => {
    setSyncState(factory)
    markFactoryEdited(factory)
  }

  const resetSyncState = (factory: Factory) => {
    factory.inSync = null
    markFactoryEdited(factory)
  }

  // The tutorial is opt-out, not opt-in: the first time anyone turns checklist mode on, in any
  // factory, explain what it does. Dismissing it (see ChecklistTutorial.vue) is what stops it
  // firing again, so this only ever checks the flag rather than setting it.
  const toggleChecklist = (enabled: boolean) => {
    setChecklistEnabled(props.factory, enabled)
    if (enabled && localStorage.getItem('dismissed-checklist-tutorial') !== 'true') {
      eventBus.emit('openChecklistTutorial')
    }
  }
</script>

<style lang="scss" scoped>
// The burnt orange of the app header — full indicator orange proved too bright
// as a 5px band between cards.
.factory-divider {
  color: var(--sf-header);
  opacity: 1;
}

// The reset button ends the chip, so the chip's own right padding only reads as a
// gap after it. Three classes to outrank `.sf-chip.small`'s `!important` padding.
.sf-chip.small.sync-chip {
  padding-right: 0 !important;
}

.factory-name {
  width: 85%;
  padding: 6px;

  // The markup's `pl-0` beat this on `!important` until Vuetify 4 layered the
  // spacing helpers. Scoped so it outranks the rule above deterministically.
  &[class*="pl-"] {
    padding-left: revert-layer;
  }

  // Underline the name itself rather than filling the field: the field runs to 85% of the
  // header, so a fill highlighted far more than the thing you were about to edit. A text
  // caret, not a hand, for the same reason — this is a field you type in, not a button.
  &:hover, &:focus {
    cursor: text;
    text-decoration: underline;
  }

  // The underline is the focus feedback; the browser's ring drew a box round the whole 85%.
  &:focus, &:focus-visible {
    outline: none;
  }
}
</style>
