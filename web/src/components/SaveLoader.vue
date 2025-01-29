<template>
  <v-overlay
    class="d-flex justify-center align-center"
    data-testid="loading-overlay"
    :model-value="isLoading"
    opacity="1"
    persistent
  >
    <v-card class="pa-4 text-center sub-card" width="500">
      <div v-if="loadingSteps > 0" class="mb-2 text-h5">{{ title }}</div>
      <v-progress-linear
        class="my-2"
        :color="loadingProgress < loadingSteps ? 'primary' : 'green'"
        height="8"
        :max="loadingSteps"
        :model-value="loadingProgress"
      />
      <div v-if="isLoading" class="mt-2 text-body-1">{{ loadingProgress }} / {{ loadingSteps }}</div>
      <div class="mt-2 text-body-2 text-grey">{{ loadingMessage }}</div>
    </v-card>
  </v-overlay>
</template>

<script setup lang="ts">
  import { onMounted, onUnmounted, ref } from 'vue'
  import eventBus from '@/utils/eventBus'

  const isLoading = ref(false)
  const title = ref('Loading...')
  const loadingSteps = ref(1)
  const loadingProgress = ref(0)
  const loadingMessage = ref('')

  function loaderInit (data: { title?: string, steps: number }) {
    isLoading.value = true
    title.value = data.title || 'Loading...'
    loadingProgress.value = 0
    loadingSteps.value = data.steps || 1
  }

  // step and finalStep are not needed, but can be used to ensure the correct outcome
  function increment (data: { message: string, step?: number, isFinalStep?: boolean }) {
    if (data.step) loadingProgress.value = data.step
    else loadingProgress.value += 1

    loadingMessage.value = data.message

    console.log(`Loading ${loadingProgress.value}/${loadingSteps.value}: ${loadingMessage.value}`)

    if ((loadingProgress.value >= loadingSteps.value) || data.isFinalStep) {
      // quickly show message before closing
      setTimeout(done, 100)
    }
  }

  function done () {
    isLoading.value = false
    loadingProgress.value = 0
  }

  onMounted(() => {
    eventBus.on('loaderInit', loaderInit)
    eventBus.on('loaderNextStep', increment)
  })

  onUnmounted(() => {
    eventBus.off('loaderInit', loaderInit)
    eventBus.off('loaderNextStep', increment)
  })

  // const getState = () => {
  //   return {
  //     isLoading: isLoading.value,
  //     loadingSteps: loadingSteps.value,
  //     loadingProgress: loadingProgress.value,
  //     loadingMessage: loadingMessage.value
  //   }
  // }
</script>

<style lang="scss" scoped>
.sub-card {
  border-radius: 16px;
  box-shadow: #0094e6 0 0 10px 0;
}

// Overlay styling in global.scss cos it's not a child of this component.
</style>
