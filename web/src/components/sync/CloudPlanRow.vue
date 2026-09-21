<template>
  <!-- Two rows, two columns: the name over its readouts in column one, the toggle in
       column two spanning both. Deliberately looser than the planner's factory card,
       whose tinted header band and divider cannot survive a control that crosses them. -->
  <v-card class="factory-card plan-card mb-2" :class="{ 'plan-open': open }">
    <div class="plan-grid">
      <div class="align-center d-flex ga-2 plan-title">
        <!-- The chip qualifies the name, so it sits against it rather than being pushed to
             the far side of the column, where it lined up with nothing and shifted with
             the width of the button opposite. -->
        <span class="plan-name text-truncate">{{ room.name }}</span>
        <v-chip
          v-if="room.shared"
          class="flex-shrink-0"
          color="green"
          size="x-small"
          variant="flat"
        >Shared</v-chip>
      </div>

      <div class="align-center d-flex ga-2 plan-meta text-caption text-grey">
        <!-- The plan's size, drawn the way the sidebar's Global Factories Summary draws
             it: the icon carries the meaning and the tooltip spells it out. Wears the
             `factory` token rather than a tonal grey, which on this dark tray read as a
             disabled control rather than as a count. -->
        <v-tooltip location="top">
          <template #activator="{ props: countProps }">
            <v-chip
              class="sf-chip factory x-small no-margin"
              data-testid="plan-factory-count"
              v-bind="countProps"
            >
              <i class="fas fa-industry mr-1" />{{ room.factoryCount }}
            </v-chip>
          </template>
          <span>{{ factoryCountLabel }} in this plan</span>
        </v-tooltip>
        <v-tooltip location="top">
          <template #activator="{ props: timeProps }">
            <span
              class="text-no-wrap text-truncate"
              data-testid="plan-last-changed"
              v-bind="timeProps"
            >{{ lastChanged }}</span>
          </template>
          <span>Last changed {{ absoluteTime(room.lastActivityAt) }}</span>
        </v-tooltip>
      </div>

      <div class="align-center d-flex plan-action">
        <v-tooltip location="top">
          <template #activator="{ props: toggleProps }">
            <v-btn
              :color="open ? undefined : 'primary'"
              :data-room-id="room.roomId"
              :data-testid="open ? 'hide-plan' : 'show-plan'"
              :loading="loading"
              :size="size"
              variant="tonal"
              v-bind="toggleProps"
              @click="emit('toggle', room.roomId)"
            >{{ open ? 'Hide' : 'Show' }}</v-btn>
          </template>
          <span>{{ open
            ? 'Close this plan\'s tab in this browser. It stays on your account.'
            : 'Open this plan in your tab bar.' }}</span>
        </v-tooltip>
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { RoomListEntry } from 'common'
  import { absoluteTime, relativeTimeLong } from '@/utils/relative-time'

  /**
   * One plan's card in the account panel's plan lists. Column one names the plan and
   * says how big it is and when it last changed; column two toggles whether it is open
   * (has a tab) in this browser. Owned and joined plans share it.
   */
  const props = withDefaults(defineProps<{
    room: RoomListEntry
    /** True when a tab for this room exists in this browser's bar. */
    open: boolean
    /** True while the Show/Hide click is being carried out. */
    loading?: boolean
    /** Read when the panel opened, so "3m ago" is measured from then. */
    now: Date
    /**
     * The account panel packs these into a narrow tray, where the toggle is a
     * detail on the row; a dialog has the room for a button you can actually hit.
     */
    size?: string
  }>(), { loading: false, size: 'x-small' })

  const emit = defineEmits<{ toggle: [roomId: string] }>()

  const factoryCountLabel = computed(() =>
    `${props.room.factoryCount} ${props.room.factoryCount === 1 ? 'factory' : 'factories'}`
  )

  /** Empty stays empty: an unreadable stamp shows nothing, not a bare label. */
  const lastChanged = computed(() => {
    const elapsed = relativeTimeLong(props.room.lastActivityAt, props.now)
    return elapsed === '' ? '' : `Last updated ${elapsed}`
  })
</script>

<style lang="scss" scoped>
  // Column one takes what is left after the button; `minmax(0, 1fr)` rather than `1fr`
  // so a long plan name truncates instead of forcing the card wider than the tray.
  .plan-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 8px;
    row-gap: 2px;
    padding: 8px 10px;
  }

  .plan-title {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
  }

  .plan-meta {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
  }

  // Spans both rows and centres against them, which is the whole point of the grid:
  // one control answering for the plan rather than one sitting on its title.
  .plan-action {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  // The square-ish corner the planner gives every button in a factory card's header.
  // That rule keyed off `.header`, which this layout no longer has.
  .plan-action .v-btn {
    border-radius: 4px;
  }

  // The name sets row one's height through its line box, and at the inherited 1.43 that
  // box carries far more air below the baseline than above the cap. Tightened to hug the
  // glyphs so the two rows sit evenly either side of the card's middle.
  .plan-name {
    line-height: 1.25;
    // A flex item will not shrink below its content without this, so `text-truncate`
    // would never get to truncate — the name would push the Shared chip out of the card.
    min-width: 0;
  }

  // The border says whether this plan has a tab in this browser: the product blue when
  // it is open, and otherwise the grey every factory card wears, straight from
  // `.factory-card`. Outranks that rule's `!important` shorthand on specificity.
  .plan-card.plan-open {
    border-color: var(--sf-product) !important;
  }
</style>
