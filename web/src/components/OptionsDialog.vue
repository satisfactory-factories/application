<template>
  <!-- Default size, not `small`: it shares a bar with the sidebar toggle and the share
       button, and at small it rendered 28px tall against their 36 and 40. -->
  <v-btn
    id="options-button"
    color="grey-darken-1 rounded"
    prepend-icon="fas fa-wrench"
    variant="flat"
    @click="showOptions = true"
  >
    Options
  </v-btn>
  <v-dialog v-model="showOptions" max-width="640">
    <v-card>
      <v-card-title>
        <i class="fas fa-wrench" /><span class="ml-2">Options</span>
      </v-card-title>
      <v-card-text class="text-body-2">
        <h3 class="text-subtitle-1 font-weight-bold mb-1">Raw resources</h3>
        <p class="mb-3 text-medium-emphasis">
          Every raw resource has to be mined or imported. The wizard lists each factory that is
          short of one and offers to build the mines, add the extractors, or wire the imports for
          you. Run it whenever a new factory comes up short — it isn't only for migrating.
        </p>
        <v-btn
          id="run-raw-wizard"
          color="primary"
          prepend-icon="fas fa-shovel"
          variant="flat"
          @click="openWizard"
        >
          Run Raw Resources Wizard
        </v-btn>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="flat" @click="showOptions = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <raw-resources-wizard v-model="showWizard" />
</template>

<script setup lang="ts">
  import RawResourcesWizard from '@/components/planner/RawResourcesWizard.vue'
  import eventBus from '@/utils/eventBus'

  const showOptions = ref(false)
  const showWizard = ref(false)

  const openWizard = () => {
    showOptions.value = false
    showWizard.value = true
  }

  // Announced on the way out, applied or cancelled alike: whatever sent the user here may have
  // closed itself to get out of the way and needs to know when it can come back.
  watch(showWizard, (open, wasOpen) => {
    if (wasOpen && !open) eventBus.emit('rawWizardClosed')
  })

  // The wizard is mounted here and nowhere else, so anything that wants to offer it — the v0.6
  // splash and the migration prompt, for two — asks through the bus rather than mounting a
  // second copy.
  onMounted(() => eventBus.on('openRawWizard', openWizard))
  onUnmounted(() => eventBus.off('openRawWizard', openWizard))
</script>
