<template>
  <app-dialog
    v-model="open"
    card-class="border-md"
    :closable="false"
    data-testid="adoption-dialog"
    icon="fas fa-cloud-upload-alt"
    max-width="640"
    persistent
    :title="landed ? 'Send this plan to your account?' : 'Sync your planner tabs now?'"
  >
    <!-- One plan that has just landed is a different question from the sweep of
         everything this browser holds, and reads badly in the plural. -->
    <p v-if="landed" class="mb-4 text-body-1">
      This plan lives only in this browser. Send it to your account and it follows you to
      every device you sign in on, and can be shared with friends later.
    </p>
    <p v-else class="mb-4 text-body-1">
      These plans live only in this browser. Sync them to your account and they follow
      you to every device, and can be shared with friends later. Nothing is merged and
      nothing is overwritten.
    </p>

    <!-- One checkbox per plan, each driven by its own id rather than by an array model, so a
         row can never end up drawn out of step with what the button will submit. -->
    <div v-for="tab in candidates" :key="tab.id" data-testid="adoption-candidate">
      <v-checkbox
        class="sf-checkbox-tick"
        color="primary"
        density="compact"
        hide-details
        :label="`${tab.name} (${planSize(tab)})`"
        :model-value="isChosen(tab.id)"
        @update:model-value="value => choose(tab.id, value === true)"
      />
    </div>

    <p class="mt-4 text-body-2 text-grey">
      {{ landed
        ? 'Say no and it simply stays local. You can send it up any time from tab settings.'
        : 'Say no and they simply stay local. You can sync them any time from the plus button.' }}
    </p>

    <template #actions>
      <v-btn
        data-testid="adopt-decline"
        :disabled="roomsStore.adopting"
        variant="text"
        @click="roomsStore.declineAdoption(true)"
      >
        No thanks
      </v-btn>
      <v-btn
        color="primary"
        data-testid="adopt-submit"
        :disabled="chosen.length === 0"
        :loading="roomsStore.adopting"
        variant="flat"
        @click="adopt"
      >
        Sync {{ chosen.length }} {{ chosen.length === 1 ? 'plan' : 'plans' }}
      </v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import type { FactoryTab } from '@/interfaces/planner/FactoryInterface'
  import { useAppStore } from '@/stores/app-store'
  import { useRoomsStore } from '@/stores/rooms-store'

  const appStore = useAppStore()
  const roomsStore = useRoomsStore()
  const { adoptionOpen, adoptionCandidates, adoptionReason } = storeToRefs(roomsStore)

  /** One plan that just arrived, rather than the sign-in sweep of the whole browser. */
  const landed = computed(() => adoptionReason.value === 'landed')

  const chosen = ref<string[]>([])

  const candidates = computed(() =>
    adoptionCandidates.value
      .map(id => appStore.getTab(id))
      .filter((tab): tab is FactoryTab => tab !== undefined)
  )

  // Opt-out rather than opt-in: the offer exists because keeping them is the
  // answer most people want, and declining is one click either way.
  watch(adoptionCandidates, ids => {
    chosen.value = [...ids]
  }, { immediate: true })

  const planSize = (tab: FactoryTab) =>
    `${tab.factories.length} ${tab.factories.length === 1 ? 'factory' : 'factories'}`

  const isChosen = (tabId: string) => chosen.value.includes(tabId)

  const choose = (tabId: string, wanted: boolean) => {
    chosen.value = wanted
      ? [...chosen.value, tabId]
      : chosen.value.filter(id => id !== tabId)
  }

  const open = computed({
    get: () => adoptionOpen.value && candidates.value.length > 0,
    set: value => {
      if (!value) roomsStore.declineAdoption()
    },
  })

  // The order the plans are offered in, not the order they were ticked in.
  const adopt = () => roomsStore.adoptTabs(
    candidates.value.map(tab => tab.id).filter(isChosen)
  )
</script>
