<template>
  <app-dialog v-model="openTutorial" max-width="800" scrollable title="Sinking tutorial">
    <template #title>
      <game-asset height="32" subject="awesome-sink" type="item_id" width="32" />
      <span class="ml-3">Sinking tutorial</span>
    </template>
    <div class="verbage">
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
    </div>
    <template #actions>
      <v-spacer />
      <v-btn color="primary" variant="flat" @click="openTutorial = false">Got it</v-btn>
    </template>
  </app-dialog>
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
