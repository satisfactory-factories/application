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
          We found some problems in your plan — micro-rounding on quantities, or imports and
          exports that had fallen out of step with each other — and have corrected the
          following:
        </p>
        <div v-for="group in groupedRepairs" :key="group.factoryName" class="mb-4">
          <h3 class="text-h6 mb-1">
            <i class="fas fa-industry mr-2" />
            <span>{{ group.factoryName }}</span>
          </h3>
          <ul class="repair-list">
            <li v-for="(repair, index) in group.repairs" :key="index" class="text-body-2 mb-1">
              <template v-if="repair.kind === 'quantity'">
                <strong>{{ repair.itemName }}</strong>
                <span class="text-medium-emphasis">
                  — {{ repair.context }} ({{ repair.field }}):
                </span>
                <span class="repair-before">{{ repair.before }}</span>
                <i class="fas fa-arrow-right mx-2" />
                <span class="repair-after">{{ repair.after }}</span>
              </template>
              <template v-else>{{ repair.summary }}</template>
            </li>
          </ul>
        </div>
        <p class="mt-4 mb-0 text-body-2 text-medium-emphasis">
          Nothing you need to do — your plan has already been recalculated with the corrected
          figures. If you had worked around any of this by hand, you can now undo that.
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
  import { PlanRepair } from '@/utils/factory-management/repair'

  const appStore = useAppStore()
  const { planRepairs, isLoaded } = storeToRefs(appStore)

  const isOpen = ref(false)
  // Snapshotted on open: dismissing clears the store's list, which would otherwise empty
  // the dialog's content while it is still fading out.
  const repairs = ref<PlanRepair[]>([])

  // Held back until loading finishes, otherwise this lands behind the loading overlay on
  // the very load that produced it.
  watch([planRepairs, isLoaded], ([entries, loaded]) => {
    if (!entries.length || !loaded || isOpen.value) return
    repairs.value = [...entries]
    isOpen.value = true
  }, { immediate: true })

  // One heading per factory with its affected items beneath, rather than repeating the
  // factory name on every line. Insertion order is the plan's own factory order.
  const groupedRepairs = computed(() => {
    const groups = new Map<string, PlanRepair[]>()
    for (const repair of repairs.value) {
      const existing = groups.get(repair.factoryName)
      if (existing) {
        existing.push(repair)
      } else {
        groups.set(repair.factoryName, [repair])
      }
    }
    return [...groups].map(([factoryName, entries]) => ({ factoryName, repairs: entries }))
  })

  const dismiss = () => {
    isOpen.value = false
    appStore.dismissPlanRepairs()
  }
</script>

<style lang="scss" scoped>
.repair-list {
  padding-left: 1.5rem;
}

.repair-before {
  color: var(--sf-error);
}

.repair-after {
  color: var(--sf-success);
  font-weight: 700;
}
</style>
