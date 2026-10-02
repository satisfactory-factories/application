<template>
  <v-overlay
    class="d-flex justify-center align-center"
    data-testid="loading-overlay"
    :model-value="showLoad"
    opacity="1"
    persistent
  >
    <v-card class="pa-4 text-center sub-card" width="500">
      <!-- Only the recovery of an interrupted load comes through here now: every other load
           puts the plan straight on screen, one factory at a time. -->
      <template v-if="!firstLoad">
        <div v-if="toLoad > 0" class="mb-2 text-h5">Loading {{ toLoad }} factories...</div>
        <v-progress-linear class="my-2" color="primary" height="8" indeterminate />
        <div class="mt-2 text-body-2 text-grey">{{ calculatingMessage }}</div>
      </template>
      <template v-if="firstLoad">
        <div class="text-h5">Loading Planner...</div>
      </template>
    </v-card>
  </v-overlay>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref } from 'vue'
  import eventBus from '@/utils/eventBus'

  // We want to show the loader by default cos there's weird chicken and egg scenarios, and the hideLoading event is eventually emitted.
  const showLoad = ref(true)

  const toLoad = ref(0) // Total factories to load
  const firstLoad = ref(true)
  const isLoading = ref(false)

  const calculatingMessages = [
    'Calculating...',
    'Crunching numbers...',
    'Doing the math...',
    'Thinking...',
    'ADA is hard at work...',
    'ADA approves of this message...',
    'FISCIT approves the efficient use of this tool...',
    'Reticulating splines...',
    'Bending the spoon...',
    'The factory must grow...',
    'Powered by cups of tea...',
    'Constructing additional pylons...',
    'We\'ll miss you Snutt!',
    'Sing us your blood song...',
    'Don\'t forget to donate if you\'re enjoying the tool! ❤️',
    'Don\'t forget to donate if you\'re enjoying the tool! ❤️', // Shameless plugging
  ]
  let calculatingMessage = ''

  const chooseRandomMessage = () => {
    const randomIndex = Math.floor(Math.random() * calculatingMessages.length)
    calculatingMessage = calculatingMessages[randomIndex]
  }

  chooseRandomMessage()

  watch(() => showLoad.value, newValue => {
    if (newValue) {
      chooseRandomMessage()
    }
  })

  // This is the entrypoint for the loader, where the dialog is told to be shown and when it is shown the load process is kicked off.
  function prepareForLoad (data: { count: number }) {
    console.log('Loader: prepareForLoad received. Count to load:', data.count)
    showLoad.value = true
    toLoad.value = data.count
    isLoading.value = true
    firstLoad.value = false

    console.log('Loader: State after prepareForLoad', getState())
  }

  const loadingCompleted = () => {
    console.log('Loader: got loadingCompleted')
    hide()
  }

  const hide = () => {
    console.log('Loader: Hiding')
    showLoad.value = false
    isLoading.value = false
    console.log('Loader: State after hide', getState())
  }

  onMounted(() => {
    eventBus.on('prepareForLoad', prepareForLoad)
    eventBus.on('loadingCompleted', loadingCompleted)
    console.log('Loader: Mounted')
  })

  onUnmounted(() => {
    eventBus.off('prepareForLoad', prepareForLoad)
    eventBus.off('loadingCompleted', loadingCompleted)
    console.log('Loader: Unmounted')
  })

  const getState = () => {
    return {
      showLoad: showLoad.value,
      toLoad: toLoad.value,
      isLoading: isLoading.value,
    }
  }
</script>

<style lang="scss" scoped>
.sub-card {
  border-radius: 16px;
  box-shadow: #0094e6 0 0 10px 0;
}

// Overlay styling in global.scss cos it's not a child of this component.
</style>
