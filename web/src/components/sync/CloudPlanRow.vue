<template>
  <!-- Drawn as one of the planner's factory cards: a `.header` naming the thing and
       carrying its controls, over a body of readouts. A bare pair of stacked lines read
       as loose text running into the next plan's; a card says where one plan ends. -->
  <v-card class="factory-card plan-card mb-2">
    <div class="header align-center d-flex ga-2">
      <span class="flex-grow-1 text-truncate">{{ room.name }}</span>
      <v-chip v-if="room.shared" color="green" size="x-small" variant="flat">Shared</v-chip>
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
    <!-- A v-card-text rather than a plain div on purpose: `.factory-card .header` drops
         its bottom border when no `.v-card-text` follows it, so the divider that makes
         this read as a header only exists if the body below is one. -->
    <v-card-text class="align-center d-flex ga-2 plan-meta text-caption text-grey">
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
            class="text-no-wrap"
            data-testid="plan-last-changed"
            v-bind="timeProps"
          >{{ lastChanged }}</span>
        </template>
        <span>Last changed {{ absoluteTime(room.lastActivityAt) }}</span>
      </v-tooltip>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { RoomListEntry } from 'common'
  import { absoluteTime, relativeTimeLong } from '@/utils/relative-time'

  /**
   * One plan's card in the account panel's plan lists. The header names the plan
   * and toggles whether it is open (has a tab) in this browser; the body says how
   * big it is and when it last changed. Owned and joined plans share it.
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
  // `.factory-card .header` in global.scss is padded for a full-width planner card
  // (12px 16px 0). These sit in a ~370px account tray as well as in a dialog, so the
  // padding comes in and the header gets a bottom of its own — the planner's card has
  // a chips bar to fill that space, and this one does not. Two classes plus the scope
  // attribute to outrank the global rule's `!important`.
  .plan-card .header {
    padding: 6px 10px !important;
  }

  .plan-card .plan-meta {
    padding: 6px 10px;
  }
</style>
