<template>
  <app-dialog
    v-model="open"
    card-class="border-md"
    data-testid="copy-plan-dialog"
    icon="fas fa-copy"
    max-width="720"
    title="Copy this plan"
  >
    <p class="mb-4 text-body-2">
      Either way you get the whole plan — every factory, its groups, power target and Depot
      research — as the planner's own JSON. Import it back into any tab, on any device.
    </p>

    <div class="d-flex flex-column flex-md-row ga-4">
      <v-card
        class="choice flex-1-1 pa-4"
        data-testid="copy-to-file"
        role="button"
        tabindex="0"
        variant="tonal"
        @click="emit('choose', 'file')"
        @keydown.enter.prevent="emit('choose', 'file')"
        @keydown.space.prevent="emit('choose', 'file')"
      >
        <div class="text-h6 mb-2">
          <span class="mr-2"><i class="fas fa-file-download" /></span>Save as a file
        </div>
        <p class="text-body-2">
          Downloads a <code>.json</code> file named after the plan. Keep it, back it up, or
          send it to someone.
        </p>
      </v-card>

      <v-card
        class="choice flex-1-1 pa-4"
        data-testid="copy-to-clipboard"
        role="button"
        tabindex="0"
        variant="tonal"
        @click="emit('choose', 'clipboard')"
        @keydown.enter.prevent="emit('choose', 'clipboard')"
        @keydown.space.prevent="emit('choose', 'clipboard')"
      >
        <div class="text-h6 mb-2">
          <span class="mr-2"><i class="fas fa-clipboard" /></span>Copy to clipboard
        </div>
        <p class="text-body-2">
          Straight onto the clipboard, ready to paste into another tab or into Discord.
        </p>
      </v-card>
    </div>

    <template #actions>
      <v-btn variant="text" @click="open = false">Cancel</v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import AppDialog from '@/components/common/AppDialog.vue'

  /**
   * The two ways a plan leaves the planner. A file is the one that survives a
   * browser wipe and can be sent to somebody; the clipboard is the quick one.
   */
  const open = defineModel<boolean>({ default: false })
  const emit = defineEmits<{ choose: ['file' | 'clipboard'] }>()
</script>

<style lang="scss" scoped>
// Basis zero, so the pair share the row evenly rather than the wordier one taking
// the width its text asks for.
.choice {
  cursor: pointer;
  flex-basis: 0;
}

// The cards are the only controls here, so a keyboard user has to see which one
// they are on.
.choice:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
