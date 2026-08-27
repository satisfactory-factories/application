<template>
  <app-dialog
    v-model="openTutorial"
    icon="fas fa-check"
    max-width="700"
    scrollable
    title="Checklist"
  >
    <div class="verbage">
      <p>Enabling Checklist lets you tick off the parts of a factory you consider built. Marking a factory in sync with the game tells you the plan matches what's built, but not <i>which</i> parts of it are: Checklist gives you that, one product, generator, import and export at a time.</p>
      <ul class="ml-4">
        <li><b>Ticking a product</b> means you've built all the assemblers (or whatever the recipe calls for) that make it.</li>
        <li><b>Ticking a power producer</b> means you've built the generators (and hooked up their fuel) that make it.</li>
        <li><b>Ticking an import</b> means you've built the means to bring that item in (trucks, trains, drones, belts, and so on) and hooked it up to this factory.</li>
        <li><b>Ticking an export</b> means you've built the infrastructure to ship that item out to its destination factory: a station, the train or drones serving it, and so on.</li>
      </ul>
      <p>Ticks live next to each product, power producer, import and export, and are summarised in the Checklist panel at the top of the factory and the progress chip beside the game-sync chip.</p>
    </div>
    <template #actions>
      <v-spacer />
      <v-btn color="primary" variant="flat" @click="close">Got it</v-btn>
    </template>
  </app-dialog>
</template>

<script lang="ts" setup>
  import eventBus from '@/utils/eventBus'

  const openTutorial = ref(false)

  eventBus.on('openChecklistTutorial', () => {
    openTutorial.value = true
  })

  // However it is closed — Got it, the corner button, Esc or the scrim — it does not come back.
  watch(openTutorial, open => {
    if (!open) localStorage.setItem('dismissed-checklist-tutorial', 'true')
  })

  const close = () => {
    openTutorial.value = false
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
