<template>
  <app-dialog
    v-model="open"
    card-class="border-md"
    :closable="false"
    data-testid="legacy-recovery-dialog"
    icon="fas fa-cloud-download-alt"
    max-width="640"
    persistent
    title="Recover your old plan?"
  >
    <p class="mb-4 text-body-1">
      Your account holds a plan with
      <span data-testid="legacy-factory-count">{{ planSize }}</span>
      from before v0.7, saved by the old sync. Bring it over and it becomes a cloud
      plan: open here, and on every device you sign in to.
    </p>

    <p class="mb-0 text-body-2 text-grey">
      It arrives as a tab of its own, so nothing already in this browser is touched.
      Say no and the old save stays exactly where it is.
    </p>

    <template #actions>
      <v-btn
        data-testid="legacy-decline"
        :disabled="roomsStore.legacyImporting"
        variant="text"
        @click="roomsStore.closeLegacyOffer()"
      >
        Not now
      </v-btn>
      <v-btn
        color="primary"
        data-testid="legacy-submit"
        :loading="roomsStore.legacyImporting"
        variant="flat"
        @click="roomsStore.importLegacyPlan()"
      >
        Import the plan
      </v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useRoomsStore } from '@/stores/rooms-store'

  const roomsStore = useRoomsStore()
  const { legacyOpen, legacyFactoryCount } = storeToRefs(roomsStore)

  const planSize = computed(() =>
    `${legacyFactoryCount.value} ${legacyFactoryCount.value === 1 ? 'factory' : 'factories'}`
  )

  const open = computed({
    get: () => legacyOpen.value,
    set: value => {
      if (!value) roomsStore.closeLegacyOffer()
    },
  })
</script>
