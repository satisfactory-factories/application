<template>
  <div class="last-updated" data-testid="last-updated" :title="title">
    <span class="last-updated__label">Last updated:</span>
    <!-- Keyed on the stamp so a second change restarts the animation instead of
         landing mid-way through the one already running. -->
    <span
      :key="stamp ?? 0"
      class="last-updated__value"
      :class="{ 'is-flashing': flashing }"
      data-testid="last-updated-value"
    >{{ value }}</span>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { useAppStore } from '@/stores/app-store'
  import { usePlanActivityStore } from '@/stores/plan-activity-store'
  import { absoluteTime, relativeTime } from '@/utils/relative-time'

  /** Fast enough that "now" never lingers past the minute it belongs to. */
  const TICK_MS = 20_000

  /** Matches the CSS animation below. */
  const FLASH_MS = 1600

  const appStore = useAppStore()
  const activity = usePlanActivityStore()

  const now = ref(new Date())
  const flashing = ref(false)

  const stamp = computed(() => {
    const tab = appStore.getCurrentTab()
    return tab ? activity.lastUpdatedAt(tab.id) : null
  })

  const iso = computed(() => stamp.value === null ? undefined : new Date(stamp.value).toISOString())

  const value = computed(() => stamp.value === null ? 'not yet' : relativeTime(iso.value, now.value))
  const title = computed(() => stamp.value === null
    ? 'Nothing in this plan has changed yet on this device.'
    : `This plan last changed ${absoluteTime(iso.value)}`)

  let flashTimer: ReturnType<typeof setTimeout> | undefined

  // Not `immediate`: opening the planner on a plan edited yesterday is not news.
  const stopWatch = watch(stamp, (next, previous) => {
    now.value = new Date()
    if (next === null || previous === null) return
    clearTimeout(flashTimer)
    flashing.value = true
    flashTimer = setTimeout(() => { flashing.value = false }, FLASH_MS)
  })

  const tick = setInterval(() => { now.value = new Date() }, TICK_MS)

  onBeforeUnmount(() => {
    clearInterval(tick)
    clearTimeout(flashTimer)
    stopWatch()
  })
</script>

<style lang="scss" scoped>
// Two lines so the bar spends as little width on this as it can: the label sits
// above the time rather than beside it.
.last-updated {
  display: flex;
  flex-direction: column;
  font-size: 0.7rem;
  line-height: 1.2;
  max-width: 96px;
  text-align: right;
  white-space: nowrap;
}

.last-updated__label {
  opacity: 0.6;
}

.last-updated__value {
  font-weight: 600;
  opacity: 0.9;
}

// Flash and fade: the product blue the rest of the planner uses for "this changed".
.last-updated__value.is-flashing {
  animation: last-updated-flash 1.6s ease-out;
}

@keyframes last-updated-flash {
  0% {
    color: var(--sf-product);
    opacity: 1;
    transform: scale(1.18);
  }

  25% {
    color: var(--sf-product);
    opacity: 1;
    transform: scale(1.18);
  }

  100% {
    color: inherit;
    opacity: 0.9;
    transform: scale(1);
  }
}
</style>
