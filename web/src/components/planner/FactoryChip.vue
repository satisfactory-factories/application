<!-- The one way a factory is drawn when something refers to it: an import's source, an export's
     destination, a search result, a checklist row. Every one of them wears the factory's group
     colour on its left edge, so a reference reads as "that factory, in that group" at a glance.

     Optional parts, each only drawn when the caller asks for it:
     - a checklist tick (pass `checked`), inside the chip so it plainly belongs to that row. `.stop`
       keeps its click off the chip's own handler, the same way the jump button at the other end
       does (without it the chip swallowed the click, #592); `.prevent` leaves the checked state to
       the parent. The `:key` on the checked value forces a fresh element on each toggle: a
       `preventDefault()`-cancelled checkbox click can lose a race against the browser's own
       revert-to-pre-click-state step, leaving the tick visually unchanged even though the state
       flipped.
     - a jump button (on unless `jumpable` is false). Search leaves it off: the whole row jumps. -->
<template>
  <v-chip
    class="sf-chip sf-chip-clickable small factory factory-chip"
    :class="{ selected }"
    :color="selected ? 'primary' : ''"
    :style="{ '--group-color': factory.group?.color ?? UNGROUPED_COLOR }"
    :title="factory.group ? `Group: ${factory.group.name}` : 'Ungrouped'"
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
    <factory-icon-display class="flex-shrink-0" :icon="factory.icon" size="20" />
    <span class="factory-chip-name ml-2">
      <slot>{{ factory.name }}</slot>
    </span>
    <v-btn
      v-if="jumpable"
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
  import { FactoryGroup } from '@/interfaces/planner/FactoryInterface'

  // Ungrouped factories still get an edge, in a neutral grey, so every chip has the same shape and
  // a grouped one stands out by its colour rather than by having an edge at all.
  const UNGROUPED_COLOR = '#6c6c6c'

  withDefaults(defineProps<{
    // Only what the chip draws, so a search result's summary fits as well as a whole factory.
    factory: { name: string, icon?: string, group?: FactoryGroup }
    // Undefined draws no tick at all, for when checklist mode is off.
    checked?: boolean
    desynced?: boolean
    tickTitle?: string
    jumpTitle?: string
    jumpable?: boolean
    selected?: boolean
  }>(), {
    checked: undefined,
    desynced: false,
    tickTitle: 'Mark as built',
    jumpTitle: 'Jump to this factory',
    jumpable: true,
    selected: false,
  })

  const emit = defineEmits<{
    toggle: []
    open: []
    jump: []
  }>()
</script>

<style lang="scss" scoped>
// The group colour on the chip's own left edge. The extra class beats `.sf-chip.factory`, which sets
// the whole border with !important.
.sf-chip.factory.factory-chip {
  border-left-color: var(--group-color) !important;
  border-left-width: 5px !important;
  max-width: 100%;

  &.selected {
    border-color: rgb(0, 123, 255) !important;
    border-left-color: var(--group-color) !important;
  }

  // The tonal fill takes the chip's own corner radius rather than the smaller one the border's
  // inner edge has, so its corners curve away and leave a wedge showing beside the wide left edge.
  :deep(.v-chip__underlay) {
    border-radius: 0;
  }

  :deep(.v-chip__content) {
    min-width: 0;
    width: 100%;
  }
}

// Gives up width before anything else in the chip when its container is narrower than the name.
.factory-chip-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 4px !important;
  margin-right: -4px;
}
</style>
