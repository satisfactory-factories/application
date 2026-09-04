<template>
  <app-dialog
    v-model="open"
    body-max-height="60vh"
    card-class="border-md"
    :closable="false"
    data-testid="plan-chooser-dialog"
    icon="fas fa-cloud"
    max-width="640"
    persistent
    scrollable
    title="Open your cloud plans?"
  >
    <p class="mb-4 text-body-1">
      Your account holds plans that are not open in this browser. Pick the ones
      to open here; the rest stay on your account, ready whenever you want them.
    </p>

    <!-- Ticking a dozen boxes one at a time is nobody's idea of a welcome, so the two
         ends of the range are one click each. Hidden for a single plan, which has no
         "all" to speak of. -->
    <div v-if="candidates.length > 1" class="d-flex ga-1 mb-1">
      <v-btn
        data-testid="chooser-select-all"
        :disabled="chosen.length === candidates.length"
        size="small"
        variant="text"
        @click="selectAll"
      >
        Select all
      </v-btn>
      <v-btn
        data-testid="chooser-select-none"
        :disabled="chosen.length === 0"
        size="small"
        variant="text"
        @click="selectNone"
      >
        Select none
      </v-btn>
    </div>

    <!-- One checkbox per plan, each driven by its own id rather than by an array model, so a
         row can never end up drawn out of step with what the button will submit. -->
    <div v-for="plan in candidates" :key="plan.roomId" data-testid="chooser-candidate">
      <v-checkbox
        class="sf-checkbox-tick"
        color="primary"
        density="compact"
        hide-details
        :model-value="isChosen(plan.roomId)"
        @update:model-value="value => choose(plan.roomId, value === true)"
      >
        <template #label>
          <span class="mr-2">{{ plan.name }}</span>
          <span class="text-caption text-grey">
            <span data-testid="chooser-factory-count">{{ planSize(plan) }}</span>
            <template v-if="relativeTime(plan.lastActivityAt, now)">
              &middot;
              <span data-testid="chooser-last-changed">{{ relativeTime(plan.lastActivityAt, now) }}</span>
            </template>
          </span>
        </template>
      </v-checkbox>
    </div>

    <p class="mt-4 text-body-2 text-grey">
      Anything left unticked stays off this browser's tab bar. The Show buttons
      in the account panel open a plan whenever you want it.
    </p>

    <template #actions>
      <v-btn
        data-testid="chooser-decline"
        :disabled="roomsStore.chooserOpening"
        variant="text"
        @click="roomsStore.closeChooser()"
      >
        Not now
      </v-btn>
      <v-btn
        color="primary"
        data-testid="chooser-submit"
        :disabled="chosen.length === 0"
        :loading="roomsStore.chooserOpening"
        variant="flat"
        @click="submit"
      >
        Open {{ chosen.length }} {{ chosen.length === 1 ? 'plan' : 'plans' }}
      </v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import type { RoomListEntry } from 'common'
  import { useRoomsStore } from '@/stores/rooms-store'
  import { relativeTime } from '@/utils/relative-time'

  const roomsStore = useRoomsStore()
  const { chooserOpen, chooserCandidates, entries } = storeToRefs(roomsStore)

  const chosen = ref<string[]>([])

  const candidates = computed(() =>
    chooserCandidates.value
      .map(roomId => entries.value[roomId])
      .filter((plan): plan is RoomListEntry => plan !== undefined)
  )

  // Opt-out rather than opt-in: a fresh sign-in usually wants its plans back,
  // and unticking the odd one is one click either way.
  watch(chooserCandidates, ids => {
    chosen.value = [...ids]
  }, { immediate: true })

  /** "3m ago" is measured from when the dialog opened, not from page load. */
  const now = ref(new Date())
  watch(chooserOpen, isOpen => {
    if (isOpen) now.value = new Date()
  })

  const planSize = (plan: RoomListEntry) =>
    `${plan.factoryCount} ${plan.factoryCount === 1 ? 'factory' : 'factories'}`

  const isChosen = (roomId: string) => chosen.value.includes(roomId)

  const selectAll = () => {
    chosen.value = candidates.value.map(plan => plan.roomId)
  }

  const selectNone = () => {
    chosen.value = []
  }

  const choose = (roomId: string, wanted: boolean) => {
    chosen.value = wanted
      ? [...chosen.value, roomId]
      : chosen.value.filter(id => id !== roomId)
  }

  const open = computed({
    get: () => chooserOpen.value && candidates.value.length > 0,
    set: value => {
      if (!value) roomsStore.closeChooser()
    },
  })

  // The order the plans are offered in, not the order they were ticked in.
  const submit = () => roomsStore.openChosenPlans(
    candidates.value.map(plan => plan.roomId).filter(isChosen)
  )
</script>
