<template>
  <!-- Fixed footprint so appearing/disappearing never shifts the input row. -->
  <span class="debounce-spinner ml-1" :class="{ active }">
    <i class="fas fa-sync fa-spin" />
  </span>
</template>

<script setup lang="ts">
  defineProps<{
    active: boolean
  }>()
</script>

<style lang="scss" scoped>
.debounce-spinner {
  display: inline-flex;
  justify-content: center;
  width: 20px;
  opacity: 0;
  transition: opacity 0.15s ease-in;

  &.active {
    opacity: 1;
  }
}
</style>
