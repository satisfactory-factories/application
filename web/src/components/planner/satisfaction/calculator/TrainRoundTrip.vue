<!-- A train's round trip: typed as 5:20, or timed. The timer can pause, for stepping away from the
     game mid-lap without starting the lap again. Stopping it writes the time to the train. -->
<template>
  <div class="d-flex align-center ga-1">
    <v-text-field
      v-if="!timing"
      class="trip-input"
      density="compact"
      :error="invalid"
      hide-details
      :model-value="text"
      placeholder="m:ss"
      variant="outlined"
      @blur="commit"
      @keyup.enter="commit"
      @update:model-value="value => (text = value)"
    />
    <span v-else class="trip-timer" :class="{ paused }">{{ formatRoundTrip(elapsed) || '0:00' }}</span>

    <!-- One button per action rather than one flipping its icon: FA swaps the <i> for an <svg>. -->
    <v-btn
      v-if="!timing || paused"
      key="start"
      color="primary"
      density="comfortable"
      icon="fas fa-play"
      size="x-small"
      :title="paused ? 'Carry on timing' : 'Time a round trip'"
      variant="text"
      @click="start"
    />
    <v-btn
      v-if="timing && !paused"
      key="pause"
      color="primary"
      density="comfortable"
      icon="fas fa-pause"
      size="x-small"
      title="Pause the timer"
      variant="text"
      @click="pause"
    />
    <v-btn
      v-if="timing"
      key="stop"
      color="primary"
      density="comfortable"
      icon="fas fa-stop"
      size="x-small"
      title="Stop and use this time"
      variant="text"
      @click="stop"
    />
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue'
  import { Train } from '@/interfaces/planner/FactoryInterface'
  import { formatRoundTrip, parseRoundTrip } from '@/utils/factory-management/train-logistics'

  const props = defineProps<{
    train: Train
  }>()

  const emit = defineEmits<{
    edited: []
  }>()

  const text = ref(formatRoundTrip(props.train.roundTripSecs))
  const invalid = ref(false)

  // A peer's edit or an undo changes the stored time under us; the field follows it.
  watch(() => props.train.roundTripSecs, secs => {
    text.value = formatRoundTrip(secs)
  })

  const commit = () => {
    const secs = parseRoundTrip(text.value ?? '')
    invalid.value = secs === null
    if (secs === null || secs === props.train.roundTripSecs) return
    props.train.roundTripSecs = secs
    emit('edited')
  }

  const timing = ref(false)
  const paused = ref(false)
  const elapsed = ref(0)
  let interval: ReturnType<typeof setInterval> | undefined

  const tick = () => {
    elapsed.value += 1
  }

  const start = () => {
    if (!timing.value) elapsed.value = 0
    timing.value = true
    paused.value = false
    clearInterval(interval)
    interval = setInterval(tick, 1000)
  }

  const pause = () => {
    paused.value = true
    clearInterval(interval)
  }

  const stop = () => {
    clearInterval(interval)
    timing.value = false
    paused.value = false
    if (elapsed.value > 0) {
      props.train.roundTripSecs = elapsed.value
      text.value = formatRoundTrip(elapsed.value)
      emit('edited')
    }
  }

  onBeforeUnmount(() => clearInterval(interval))
</script>

<style lang="scss" scoped>
.trip-input {
  flex: 0 0 96px;

  :deep(input) {
    text-align: center;
  }
}

.trip-timer {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 84px;
  padding-left: 8px;

  &.paused {
    opacity: 0.6;
  }
}
</style>
