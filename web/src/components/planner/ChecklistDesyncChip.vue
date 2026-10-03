<!--
  The amber flag on a ticked checklist row whose number has since moved.

  It carries the two numbers rather than the bare word "Desynced": knowing that something changed
  is not actionable, knowing it went from 560/min to 720/min is — the player can tell at a glance
  whether that is a belt upgrade or a whole new mine, without opening anything. Clicking it is the
  acknowledgement ("yes, I have built that"), the same action as re-ticking the row's checkbox;
  the tooltip states the other option, which is to change the plan back instead.
-->
<template>
  <tooltip :text="checklistDesyncReason(desync)">
    <v-chip
      class="sf-chip sf-chip-clickable x-small status-warning no-margin"
      @click="emit('acknowledge')"
    >
      <i class="fas fa-exclamation-triangle" />
      <span class="ml-2">{{ checklistDesyncChange(desync) }}</span>
    </v-chip>
  </tooltip>
</template>

<script setup lang="ts">
  import {
    ChecklistDesync,
    checklistDesyncChange,
    checklistDesyncReason,
  } from '@/utils/factory-management/checklist'

  defineProps<{
    desync: ChecklistDesync
  }>()

  const emit = defineEmits<{
    (e: 'acknowledge'): void
  }>()
</script>
