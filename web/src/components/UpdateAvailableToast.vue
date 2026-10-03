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
  import { onBeforeUnmount, ref } from 'vue'
  import eventBus from '@/utils/eventBus'

  const isOpen = ref(false)
  const version = ref('')

  // Nothing is cleared first. The plan lives in localStorage and a reload does not lose it;
  // touching local state here is how a nudge turns into lost work.
  const reload = () => {
    window.location.reload()
  }

  // The version gate (426, or a 4426 close) is the same news said harder: it means nothing this
  // tab sends will be accepted until it reloads, and VersionPrompt is already saying so. This
  // stands down rather than putting a second banner on screen beside it.
  const gated = ref(false)

  const announce = ({ version: announced }: { version: string }) => {
    if (gated.value) return
    version.value = announced
    isOpen.value = true
  }

  const standDown = () => {
    gated.value = true
    isOpen.value = false
  }

  eventBus.on('updateAvailable', announce)
  eventBus.on('versionMismatch', standDown)

  onBeforeUnmount(() => {
    eventBus.off('updateAvailable', announce)
    eventBus.off('versionMismatch', standDown)
  })
</script>
