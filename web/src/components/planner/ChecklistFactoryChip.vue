<!-- A factory chip for one import or export, with its checklist tick inside it. Shared by the
     export chips in the Satisfaction column and the Imports / Exports columns of the Checklist
     panel, so the tick sits in the same place, at the same size, everywhere it is drawn.

     The tick sits inside the chip so it plainly belongs to that row. `.stop` keeps its click off
     the chip's own handler, the same way the jump button at the other end does (without it the
     chip swallowed the click, #592); `.prevent` leaves the checked state to the parent. The `:key`
     on the checked value forces a fresh element on each toggle: a `preventDefault()`-cancelled
     checkbox click can lose a race against the browser's own revert-to-pre-click-state step,
     leaving the tick visually unchanged even though the state flipped. -->
<template>
  <v-chip
    class="sf-chip sf-chip-clickable small factory"
    :color="selected ? 'primary' : ''"
    :style="selected ? 'border-color: rgb(0, 123, 255) !important' : ''"
    @click="emit('open')"
  >
    <input
      v-if="checked !== undefined"
      :key="String(checked)"
      :checked="checked"
      class="sf-tick checklist-tick"
      :class="{ desynced }"
      :title="tickTitle"
      type="checkbox"
      @click.stop.prevent="emit('toggle')"
      @mousedown.stop
    >
    <factory-icon-display :icon="factory.icon" size="20" />
    <span class="ml-2">
      <slot>{{ factory.name }}</slot>
    </span>
    <v-btn
      class="chip-jump-btn ml-2"
      color="primary"
      icon="fas fa-eye"
      size="x-small"
      :title="jumpTitle"
      variant="flat"
      @click.stop="emit('jump')"
    />
  </v-chip>
</template>

<script setup lang="ts">
  import { Factory } from '@/interfaces/planner/FactoryInterface'

  withDefaults(defineProps<{
    factory: Factory
    // Undefined draws no tick at all, for when checklist mode is off.
    checked?: boolean
    desynced?: boolean
    tickTitle?: string
    jumpTitle?: string
    selected?: boolean
  }>(), {
    checked: undefined,
    desynced: false,
    tickTitle: 'Mark as built',
    jumpTitle: 'Jump to this factory',
    selected: false,
  })

  const emit = defineEmits<{
    toggle: []
    open: []
    jump: []
  }>()
</script>

<style lang="scss" scoped>
// The tick claws back the chip's left padding by the same 4px the jump button claws back on the
// right, so both ends of the chip sit the same distance from its border.
.checklist-tick {
  flex-shrink: 0;
  margin: 0 8px 0 -4px;

  // Desynced: still checked, but the plan's number for this item moved since it was ticked.
  // Amber rather than red, and without the tick mark: the tick stays applied, this only flags it
  // may be stale.
  &.desynced:checked {
    background-color: var(--sf-status-warning-border);
    border-color: var(--sf-status-warning-border);

    &::after {
      content: none;
    }
  }
}

// Sits inside the chip, so it has to shed the icon button's circle and claw back the chip's right
// padding to avoid looking bolted on.
.chip-jump-btn {
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 4px !important;
  margin-right: -4px;
}
</style>
