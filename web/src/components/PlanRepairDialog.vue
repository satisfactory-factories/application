<template>
  <v-dialog v-model="isOpen" max-width="700" scrollable>
    <v-card>
      <v-card-title class="text-h6 py-4">
        <i class="fas fa-wrench mr-2" />
        <span>Plan data repaired</span>
      </v-card-title>
      <v-divider />
      <v-card-text>
        <p class="mb-4">
          We have detected some data errors in your plan (usually to do with micro-rounding)
          and have fixed the following items:
        </p>
        <v-list class="py-0" density="compact">
          <v-list-item
            v-for="(repair, index) in repairs"
            :key="index"
            class="px-0"
          >
            <v-list-item-title class="text-body-2">
              <strong>{{ repair.factoryName }}</strong>
              <span class="mx-1 text-medium-emphasis">/</span>
              <strong>{{ repair.itemName }}</strong>
              <span class="text-medium-emphasis"> ({{ repair.field }})</span>
            </v-list-item-title>
            <v-list-item-subtitle class="text-body-2">
              <span>{{ repair.context }}:</span>
              <span class="ml-1 text-medium-emphasis">{{ repair.before }}</span>
              <i class="fas fa-arrow-right mx-2" />
              <span class="font-weight-bold">{{ repair.after }}</span>
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
        <p class="mt-4 mb-0 text-body-2 text-medium-emphasis">
          Nothing you need to do — your plan has already been recalculated with the corrected
          figures. If you had worked around this by hand, you can now undo that.
        </p>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="dismiss">Got it</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/stores/app-store'

  const appStore = useAppStore()
  const { planRepairs, isLoaded } = storeToRefs(appStore)

  const isOpen = ref(false)
  // Snapshotted on open: dismissing clears the store's list, which would otherwise empty
  // the dialog's content while it is still fading out.
  const repairs = ref<typeof planRepairs.value>([])

  // Held back until loading finishes, otherwise this lands behind the loading overlay on
  // the very load that produced it.
  watch([planRepairs, isLoaded], ([entries, loaded]) => {
    if (!entries.length || !loaded || isOpen.value) return
    repairs.value = [...entries]
    isOpen.value = true
  }, { immediate: true })

  const dismiss = () => {
    isOpen.value = false
    appStore.dismissPlanRepairs()
  }
</script>
