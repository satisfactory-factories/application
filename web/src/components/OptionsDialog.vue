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
          you.
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

        <v-divider class="my-4" />

        <h3 class="text-subtitle-1 font-weight-bold mb-1">Factory groups</h3>
        <p class="mb-3 text-medium-emphasis">
          A group's product row lists what the group delivers to other factories, with its surplus
          or shortfall. Internal products within a factory are not shown by default. If you wish to
          show them, check this option.
        </p>
        <!-- Box and tick drawn in CSS, as in the multi-group editor: Vuetify's FA aliases use
             `far fa-square` for the unchecked state and this app ships no Font Awesome regular
             family, so a v-checkbox has nothing to draw until it is ticked and reads as a stray
             filled square. -->
        <div
          :aria-checked="options.showInternalGroupProducts"
          class="option-toggle d-flex align-center ga-3"
          role="checkbox"
          tabindex="0"
          @click="options.showInternalGroupProducts = !options.showInternalGroupProducts"
          @keydown.enter.prevent="options.showInternalGroupProducts = !options.showInternalGroupProducts"
          @keydown.space.prevent="options.showInternalGroupProducts = !options.showInternalGroupProducts"
        >
          <span class="tick" :class="{ on: options.showInternalGroupProducts }" />
          <span>Show group internal products</span>
        </div>

        <p class="mt-4 mb-3 text-medium-emphasis">
          Each group in the sidebar can also show what it generates, what it consumes and whether
          it pays for itself, the same way the Statistics link above them does.
        </p>
        <div
          :aria-checked="options.showGroupPower"
          class="option-toggle d-flex align-center ga-3"
          role="checkbox"
          tabindex="0"
          @click="options.showGroupPower = !options.showGroupPower"
          @keydown.enter.prevent="options.showGroupPower = !options.showGroupPower"
          @keydown.space.prevent="options.showGroupPower = !options.showGroupPower"
        >
          <span class="tick" :class="{ on: options.showGroupPower }" />
          <span>Show group power</span>
        </div>
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
  import { usePlannerOptions } from '@/composables/usePlannerOptions'

  const showOptions = ref(false)
  const showWizard = ref(false)
  const options = usePlannerOptions()

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

<style lang="scss" scoped>
.option-toggle {
  cursor: pointer;
  user-select: none;
  width: fit-content;
}

.tick {
  position: relative;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-radius: 3px;
  display: inline-block;
  flex: 0 0 auto;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.tick.on {
  background-color: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary));
}

// Two borders of a rotated box: the short arm and the long arm of a tick.
.tick.on::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 0;
  width: 5px;
  height: 10px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
</style>
