<template>
  <v-dialog v-model="open" max-width="640" persistent>
    <v-card class="border-md" data-testid="adoption-dialog">
      <v-card-title class="text-h5">Keep my local plans too?</v-card-title>
      <v-card-text>
        <p class="mb-4 text-body-1">
          These plans live only in this browser. Sync them to your account and they follow
          you to every device, and can be shared with friends later. Nothing is merged and
          nothing is overwritten.
        </p>

        <v-checkbox
          v-for="tab in candidates"
          :key="tab.id"
          v-model="selected"
          density="compact"
          hide-details
          :label="`${tab.name} (${tab.factories.length} factories)`"
          :value="tab.id"
        />

        <p class="mt-4 text-body-2 text-grey">
          Say no and they simply stay local. You can sync them any time from the plus button.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-btn :disabled="roomsStore.adopting" variant="text" @click="roomsStore.declineAdoption()">
          No thanks
        </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          :disabled="selected.length === 0"
          :loading="roomsStore.adopting"
          variant="flat"
          @click="adopt"
        >
          Sync {{ selected.length }} plan(s)
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import type { FactoryTab } from '@/interfaces/planner/FactoryInterface'
  import { useAppStore } from '@/stores/app-store'
  import { useRoomsStore } from '@/stores/rooms-store'

  const appStore = useAppStore()
  const roomsStore = useRoomsStore()
  const { adoptionOpen, adoptionCandidates } = storeToRefs(roomsStore)

  const selected = ref<string[]>([])

  const candidates = computed(() =>
    adoptionCandidates.value
      .map(id => appStore.getTab(id))
      .filter((tab): tab is FactoryTab => tab !== undefined)
  )

  // Opt-out rather than opt-in: the offer exists because keeping them is the
  // answer most people want, and declining is one click either way.
  watch(adoptionCandidates, ids => {
    selected.value = [...ids]
  }, { immediate: true })

  const open = computed({
    get: () => adoptionOpen.value && candidates.value.length > 0,
    set: value => {
      if (!value) roomsStore.declineAdoption()
    },
  })

  const adopt = () => roomsStore.adoptTabs(selected.value)
</script>
