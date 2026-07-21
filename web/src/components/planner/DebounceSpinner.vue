<template>
  <!-- Rendered only while a recalc is pending: an always-mounted opacity-0 spinner
       would keep its fa-spin animation ticking invisibly and reserve blank space
       beside every input. Spawning it per-edit keeps the DOM clean. -->
  <span v-if="active" class="debounce-spinner mx-2">
    <v-icon icon="fas fa-sync fa-spin" size="small" />
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
  align-items: center;
}
</style>
