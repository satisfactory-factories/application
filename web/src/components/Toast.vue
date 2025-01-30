<template>
  <v-snackbar v-model="showToast" :color="toastType" :timeout="timeout" top>
    <span v-html="toastMessage" />
  </v-snackbar>
</template>

<script setup lang="ts">
  import eventBus from '@/utils/eventBus'

  export interface ToastData {
    message: string
    type?: 'info' | 'success' | 'warning' | 'error'
    timeout?: number
  }

  const showToast = ref(false)
  const toastType = ref('success')
  const toastMessage = ref('')
  const timeout = ref(3000)

  const showToastMessage = (data: ToastData) => {
    if (data.type === 'error') {
      toastType.value = 'red'
    } else if (data.type === 'warning') {
      toastType.value = 'amber'
    } else if (data.type === 'info') {
      toastType.value = 'blue'
    } else {
      toastType.value = 'success'
    }
    toastMessage.value = data.message
    timeout.value = data.timeout || 3000
    showToast.value = true
  }

  eventBus.on('toast', showToastMessage)

</script>
