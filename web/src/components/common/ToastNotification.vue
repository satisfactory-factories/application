<template>
  <v-snackbar
    v-model="open"
    :color="colour"
    data-testid="toast"
    :timeout="-1"
    top
  >
    <!-- Escaped: toasts interpolate factory and part names. See safeHtml. -->
    <span v-html="safeHtml(message)" />

    <!-- Keyed so a second toast restarts the animation instead of inheriting the
         first one's remaining time. -->
    <div
      v-if="variant === 'timed'"
      :key="cycle"
      class="toast-timer"
      data-testid="toast-timer"
      :style="{ animationDuration: `${duration}ms` }"
    />

    <template v-if="variant === 'permanent'" #actions>
      <v-btn data-testid="toast-dismiss" variant="text" @click="dismiss">Dismiss</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { safeHtml } from '@/utils/safeHtml'
  import type { ToastType, ToastVariant } from '@/utils/toast'

  const props = withDefaults(defineProps<{
    modelValue: boolean
    message: string
    type?: ToastType
    variant?: ToastVariant
    /** How long a `plain` or `timed` toast stays up. */
    duration?: number
    /** Bump to restart the timer and the bar for a toast that is already showing. */
    sequence?: number
  }>(), {
    type: 'success',
    variant: 'plain',
    duration: 3000,
    sequence: 0,
  })

  const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

  const open = computed({
    get: () => props.modelValue,
    set: (value: boolean) => emit('update:modelValue', value),
  })

  const COLOURS: Record<ToastType, string> = {
    error: 'red',
    warning: 'amber',
    info: 'blue',
    success: 'success',
  }

  const colour = computed(() => COLOURS[props.type])

  // The timer is ours rather than Vuetify's so the bar and the dismissal are driven
  // by one clock; a `permanent` toast has none at all.
  const cycle = ref(0)
  let timer: ReturnType<typeof setTimeout> | undefined

  const dismiss = () => {
    open.value = false
  }

  const arm = () => {
    clearTimeout(timer)
    if (!props.modelValue || props.variant === 'permanent') return
    cycle.value += 1
    timer = setTimeout(dismiss, props.duration)
  }

  watch(
    () => [props.modelValue, props.message, props.variant, props.duration, props.sequence],
    arm,
    { immediate: true },
  )

  onBeforeUnmount(() => clearTimeout(timer))
</script>

<style lang="scss" scoped>
// The bar is the toast's own bottom edge, so the wrapper has to clip it and the
// content has to be what it measures itself against.
:deep(.v-snackbar__wrapper) {
  overflow: hidden;
}

:deep(.v-snackbar__content) {
  position: relative;
}

// Anchored right so the remaining time slides left to right as it runs out.
.toast-timer {
  animation: toast-drain linear forwards;
  background-color: rgba(255, 255, 255, 0.85);
  bottom: 0;
  height: 3px;
  left: 0;
  position: absolute;
  right: 0;
  transform-origin: right center;
}

@keyframes toast-drain {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}
</style>
