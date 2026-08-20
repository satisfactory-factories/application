<template>
  <v-dialog max-width="800" :model-value="openTutorial" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center ga-3 py-4">
        <game-asset height="40" subject="awesome-sink" type="item_id" width="40" />
        <h3 class="text-h3">Sinking tutorial</h3>
      </v-card-title>
      <v-card-text class="verbage">
        <p>We make two assumptions when you use AWESOME Sinks.</p>
        <ol class="ml-6">
          <li>
            You are using <b>Programmable Splitters</b> to send the excess to your sinks. If you use
            a normal splitter, the numbers will be inaccurate.
          </li>
          <li>
            You are responsible for making sure the belt feeding the sink is of adequate speed.
            Without this, the numbers also become inaccurate.
          </li>
        </ol>
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

  eventBus.on('openAwesomeSinkTutorial', () => {
    openTutorial.value = true
  })
</script>

<style scoped lang="scss">
.verbage {
  p, li {
    margin-bottom: 1rem;
  }
}
</style>
