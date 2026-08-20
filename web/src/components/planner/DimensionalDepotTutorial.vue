<template>
  <v-dialog max-width="800" :model-value="openTutorial" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-3">
        <game-asset height="40" subject="dimensional-depot" type="item_id" width="40" />
        <h3 class="text-h3">Dimensional Depot tutorial</h3>
      </v-card-title>
      <v-card-text class="verbage">
        <p>
          A summary of every Dimensional Depot Uploader in your plan, and the items they are
          tracking, sits at the top of the planner.
        </p>
        <p>
          We make no assumptions about how much an Uploader takes off the belt. What we do assume is
          that it eventually backs up, so your surplus numbers are accurate once that happens.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" variant="flat" @click="openTutorial = false">Got it</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import eventBus from '@/utils/eventBus'

  const openTutorial = ref(false)

  eventBus.on('openDimensionalDepotTutorial', () => {
    openTutorial.value = true
  })
</script>

<style scoped lang="scss">
.verbage {
  p {
    margin-bottom: 1rem;
  }
}
</style>
