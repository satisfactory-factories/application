<template>
  <div class="mb-2">
    <div class="align-center d-flex ga-2">
      <span class="flex-grow-1 text-truncate">{{ room.name }}</span>
      <v-chip v-if="room.shared" color="green" size="x-small" variant="flat">Shared</v-chip>
      <v-tooltip location="top">
        <template #activator="{ props: toggleProps }">
          <v-btn
            :color="open ? undefined : 'primary'"
            :data-room-id="room.roomId"
            :data-testid="open ? 'hide-plan' : 'show-plan'"
            :loading="loading"
            size="x-small"
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
    <div class="align-center d-flex ga-2 text-caption text-grey">
      <span data-testid="plan-factory-count">{{ factoryCountLabel }}</span>
      <v-tooltip location="top">
        <template #activator="{ props: timeProps }">
          <span
            class="text-no-wrap"
            data-testid="plan-last-changed"
            v-bind="timeProps"
          >{{ relativeTime(room.lastActivityAt, now) }}</span>
        </template>
        <span>Last changed {{ absoluteTime(room.lastActivityAt) }}</span>
      </v-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { RoomListEntry } from 'common'
  import { absoluteTime, relativeTime } from '@/utils/relative-time'

  /**
   * One two-line row of the account panel's plan lists. Line one names the plan
   * and toggles whether it is open (has a tab) in this browser; line two says
   * how big it is and when it last changed. Owned and joined plans share it.
   */
  const props = defineProps<{
    room: RoomListEntry
    /** True when a tab for this room exists in this browser's bar. */
    open: boolean
    /** True while the Show/Hide click is being carried out. */
    loading?: boolean
    /** Read when the panel opened, so "3m ago" is measured from then. */
    now: Date
  }>()

  const emit = defineEmits<{ toggle: [roomId: string] }>()

  const factoryCountLabel = computed(() =>
    `${props.room.factoryCount} ${props.room.factoryCount === 1 ? 'factory' : 'factories'}`
  )
</script>
