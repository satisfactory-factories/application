<template>
  <v-snackbar v-model="isOpen" color="blue" location="bottom" :timeout="-1">
    <i class="fas fa-arrow-up mr-2" />
    <span>Version {{ version }} of the planner is out. Reload when you're ready.</span>
    <template #actions>
      <v-btn variant="text" @click="reload">Reload</v-btn>
      <v-btn icon="fas fa-times" size="small" variant="text" @click="isOpen = false" />
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import eventBus from '@/utils/eventBus'

  const isOpen = ref(false)
  const version = ref('')

  // Nothing is cleared first. The plan lives in localStorage and a reload does not lose it;
  // touching local state here is how a nudge turns into lost work.
  const reload = () => {
    window.location.reload()
  }

  eventBus.on('updateAvailable', ({ version: announced }) => {
    version.value = announced
    isOpen.value = true
  })
</script>
