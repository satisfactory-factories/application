<template>
  <v-overlay
    class="d-flex justify-center align-center"
    data-testid="loading-overlay"
    :model-value="show"
    opacity="1"
    persistent
  >
    <v-card class="pa-4 text-center sub-card" width="500">
      <div class="mb-2 text-h5">Deleting factory...</div>
      <div class="mb-2 text-body-1">This may take a while for large plans!</div>
    </v-card>
  </v-overlay>
</template>

<script setup lang="ts">
  import { defineProps } from 'vue'

  defineProps<{
    show: boolean
  }>()
</script>
