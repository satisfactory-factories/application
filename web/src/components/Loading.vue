<template>
  <v-overlay
    class="d-flex justify-center align-center"
    :model-value="showLoad"
    opacity="1"
    persistent
    @after-enter="afterEnter"
  >
    <v-card class="pa-4 text-center sub-card" width="500">
      <div v-if="toLoad > 0 && !firstLoad" class="mb-2 text-h5">Loading {{ toLoad }} factories...</div>
      <div v-else class="mb-2 text-h5">Loading Planner...</div>
      <v-progress-linear
        class="my-2"
        color="primary"
        height="8"
        :max="toLoad + 1"
        :model-value="loaded"
      />
      <div v-if="!isCalculating && !firstLoad" class="mt-2 text-body-1">{{ loaded }} out of {{ toLoad }} loaded...</div>
      <div v-if="isCalculating" class="mt-2 text-body-1">{{ calculatingMessage }}</div>
    </v-card>
  </v-overlay>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref } from 'vue'
  import eventBus from '@/utils/eventBus'

  // We want to show the loader by default cos there's weird chicken and egg scenarios, and the hideLoading event is eventually emitted.
  const showLoad = ref(true)

  const toLoad = ref(0) // Total factories to load
  const loaded = ref(0) // Progress bar value
  let firstLoad = true
  const isCalculating = ref(false) // Flag to indicate calculation step

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
    'Don\'t forget to donate if you\'re enjoying the tool! :)',
  ]
  let calculatingMessage = ''

  const chooseRandomMessage = () => {
    const randomIndex = Math.floor(Math.random() * calculatingMessages.length)
    calculatingMessage = calculatingMessages[randomIndex]
  }

  function handleShowLoading (count: number) {
    console.log('Loader: Showing with factories to load:', count)

    // If there's no factories to load, stop now.
    if (count === 0) {
      console.log('Loader: No factories to load, stopping now')
      showLoad.value = false
      eventBus.emit('loadingCompleted')
      return
    }
    showLoad.value = true
    toLoad.value = count
    loaded.value = 0
    chooseRandomMessage()
    isCalculating.value = false
    console.log('Loader: State after showLoading', { showLoad: showLoad.value, toLoad: toLoad.value, loaded: loaded.value, isCalculating: isCalculating.value })
  }

  function handleHideLoading () {
    console.log('Loader: Hiding')
    showLoad.value = false
    console.log('Loader: State after hideLoading', { showLoad: showLoad.value, toLoad: toLoad.value, loaded: loaded.value, isCalculating: isCalculating.value })
  }

  function handleIncrementLoad (payload: { step: string }) {
    console.log('Loader: Incrementing load', payload)
    loaded.value += 1
    if (payload.step === 'calculation') {
      isCalculating.value = true
    }
  }

  const afterEnter = () => {
    if (firstLoad) {
      eventBus.emit('readyForFirstLoad')
      firstLoad = false
    } else {
      eventBus.emit('readyForLoad')
    }
  }

  onMounted(() => {
    eventBus.on('showLoading', handleShowLoading)
    eventBus.on('hideLoading', handleHideLoading)
    eventBus.on('incrementLoad', handleIncrementLoad)
    console.log('Loader: Ready')
  })

  onUnmounted(() => {
    eventBus.off('showLoading', handleShowLoading)
    eventBus.off('hideLoading', handleHideLoading)
    eventBus.off('incrementLoad', handleIncrementLoad)
  })
</script>

<style lang="scss" scoped>
.sub-card {
  border-radius: 16px;
  box-shadow: #0094e6 0 0 10px 0;
}

// Overlay styling in global.scss cos it's not a child of this component.
</style>
