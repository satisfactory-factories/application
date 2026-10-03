<template>
  <toast-notification
    v-model="showToast"
    :duration="timeout"
    :message="toastMessage"
    :sequence="sequence"
    :type="toastType"
    :variant="toastVariant"
  />
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import ToastNotification from '@/components/common/ToastNotification.vue'
  import eventBus from '@/utils/eventBus'
  import type { ToastData, ToastType, ToastVariant } from '@/utils/toast'

  const showToast = ref(false)
  const toastType = ref<ToastType>('success')
  const toastVariant = ref<ToastVariant>('plain')
  const toastMessage = ref('')
  const timeout = ref(3000)
  // Restarts the bar when the same notice arrives again while it is still up.
  const sequence = ref(0)

  const showToastMessage = (data: ToastData) => {
    toastType.value = data.type ?? 'success'
    toastVariant.value = data.variant ?? 'plain'
    toastMessage.value = data.message
    timeout.value = data.timeout || 3000
    sequence.value += 1
    showToast.value = true
  }

  eventBus.on('toast', showToastMessage)

</script>
