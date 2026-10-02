<template>
  <save-loader />
  <!-- On the first visit the planner waits a frame behind the loading screen, so the page around
       it (header, tabs) is drawn first and shows through the screen while the plan builds. -->
  <planner v-if="shellPainted" />
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue'

  const shellPainted = ref(!document.getElementById('boot-loader'))

  onMounted(() => {
    if (shellPainted.value) return
    requestAnimationFrame(() => requestAnimationFrame(() => {
      shellPainted.value = true
    }))
  })
</script>
