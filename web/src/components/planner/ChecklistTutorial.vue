<template>
  <v-dialog max-width="700" :model-value="openTutorial" scrollable @update:model-value="value => !value && close()">
    <v-card>
      <v-card-title><h3 class="text-h3">Checklist</h3></v-card-title>
      <v-card-text class="verbage">
        <p>Enabling Checklist lets you tick off the parts of a factory you consider built. Marking a factory in sync with the game tells you the plan matches what's built, but not <i>which</i> parts of it are — Checklist gives you that, one product, import and export at a time.</p>
        <ul class="ml-4">
          <li><b>Ticking a product</b> means you've built all the assemblers (or whatever the recipe calls for) that make it.</li>
          <li><b>Ticking an import</b> means you've built the means to bring that item in — trucks, trains, drones, belts — and hooked it up to this factory.</li>
          <li><b>Ticking an export</b> means you've built the infrastructure to ship that item out to its destination factory — a station, the train or drones serving it, and so on.</li>
        </ul>
        <p>Ticks live next to each product, import and export, and are summarised in the Checklist panel at the top of the factory and the progress chip beside the game-sync chip.</p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="close">Got it</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import eventBus from '@/utils/eventBus'

  const openTutorial = ref(false)

  eventBus.on('openChecklistTutorial', () => {
    openTutorial.value = true
  })

  const close = () => {
    openTutorial.value = false
    localStorage.setItem('dismissed-checklist-tutorial', 'true')
  }
</script>

<style scoped lang="scss">
.verbage {
  * {
    margin-bottom: 1rem;
  }

  li {
    margin-bottom: 0.5rem !important;
  }
}
</style>
