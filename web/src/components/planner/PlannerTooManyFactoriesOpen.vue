<template>
  <div v-if="showAlert && !warningDismissed" class="count-warning bg-amber w-100 text-center py-1 position-absolute">
    <span v-if="tooManyShownFactories"><b>Too many factories are visible (> {{ factoryLimit }})</b>&nbsp;</span>
    <span v-if="tooManyInputs"><b>Too many imports are being shown! (> {{ inputLimit }})</b>&nbsp;</span>
    Please hide some factories or your planner will MAJORLY lag!
    <v-btn density="compact" @click="hideAll">Hide all</v-btn>
    <v-btn class="ml-2 super-sm" density="compact" @click="warningDismissed = true">X</v-btn>
  </div>
</template>

<script setup lang="ts">
  import { defineEmits } from 'vue'
  import { Factory } from '@/interfaces/planner/FactoryInterface'

  const props = defineProps<{
    factories: Factory[]
  }>()

  const factoryLimit = 10
  const inputLimit = 30
  const warningDismissed = ref(false)

  const emit = defineEmits<{(event: 'hide-all'): void}>()
  const inputs = computed(() => {
    let count = 0
    props.factories.forEach(factory => {
      if (factory.hidden) return
      count += factory.inputs.length
    })
    return count
  })
  const openFactories = computed(() => {
    let count = 0
    props.factories.forEach(factory => {
      if (!factory.hidden) count++
    })
    return count
  })
  const tooManyInputs = computed(() => inputs.value > inputLimit)
  const tooManyShownFactories = computed(() => openFactories.value > factoryLimit)
  const showAlert = computed(() => tooManyInputs.value || tooManyShownFactories.value)

  const hideAll = () => {
    warningDismissed.value = false
    emit('hide-all')
  }

</script>

<style lang="scss">
  .count-warning {
    z-index: 1;
  }
  .super-sm {
    min-width: 30px;
    width: 30px;
    max-width: 30px;
    padding: 0 2px;
  }
</style>
