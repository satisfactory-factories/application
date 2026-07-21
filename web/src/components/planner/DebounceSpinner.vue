<template>
  <!-- Rendered only while a recalc is pending: an always-mounted opacity-0 spinner
       would keep its fa-spin animation ticking invisibly and reserve blank space
       beside every input. The transition slides the slot open as the user types and
       slides it closed again once the recalculation lands. -->
  <transition name="debounce-slide">
    <span v-if="active" class="debounce-spinner">
      <v-icon icon="fas fa-sync fa-spin" size="small" />
    </span>
  </transition>
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
  justify-content: center;
  // Spacing lives in the width (not margins) so the whole slot animates as one.
  width: 36px;
  overflow: hidden;
  white-space: nowrap;
}

.debounce-slide-enter-active,
.debounce-slide-leave-active {
  transition: width 0.25s ease, opacity 0.25s ease, transform 0.25s ease;
}

.debounce-slide-enter-from,
.debounce-slide-leave-to {
  width: 0;
  opacity: 0;
  transform: translateX(-6px);
}
</style>
