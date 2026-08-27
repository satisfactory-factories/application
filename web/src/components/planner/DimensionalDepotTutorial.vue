<template>
  <app-dialog v-model="openTutorial" max-width="800" scrollable title="Dimensional Depot tutorial">
    <template #title>
      <game-asset height="36" subject="dimensional-depot" type="item_id" width="36" />
      <span class="ml-3">Dimensional Depot tutorial</span>
    </template>
    <div class="verbage">
      <p>
        A summary of every Dimensional Depot Uploader in your plan, and the items they are
        tracking, sits at the top of the planner.
      </p>
      <p>
        We make no assumptions about how much an Uploader takes off the belt. What we do assume is
        that it eventually backs up, so your surplus numbers are accurate once that happens.
      </p>
      <!-- The summary is a scroll away and nothing on this dialog says where, so the dialog
           takes them rather than describing the journey. -->
      <div class="d-flex justify-center mt-4">
        <v-btn class="sf-chip small dimensional-depot depot-jump" rounded="pill" variant="flat" @click="showDepot">
          <game-asset
            class="mr-2"
            height="20"
            subject="dimensional-depot"
            type="item_id"
            width="20"
          />
          Take me to the Dimensional Depot
        </v-btn>
      </div>
    </div>
    <template #actions>
      <v-btn color="primary" variant="flat" @click="openTutorial = false">Got it</v-btn>
    </template>
  </app-dialog>
</template>

<script lang="ts" setup>
  import eventBus from '@/utils/eventBus'

  const openTutorial = ref(false)

  eventBus.on('openDimensionalDepotTutorial', () => {
    openTutorial.value = true
  })

  const showDepot = () => {
    openTutorial.value = false
    eventBus.emit('jumpToSection', 'dimensional-depot')
  }
</script>

<style scoped lang="scss">
.verbage {
  p {
    margin-bottom: 1rem;
  }
}

// Styled as the Depot section's own chips: violet text and border come from .sf-chip, and only
// the translucent fill has to be stated, because a v-btn cannot resolve a tonal background from
// the token by itself.
.depot-jump {
  background-color: color-mix(in srgb, var(--sf-dimensional-depot) 12%, transparent) !important;
  margin: 0 !important;
}
</style>
