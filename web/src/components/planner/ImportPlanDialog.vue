<template>
  <app-dialog
    v-model="open"
    card-class="border-md"
    data-testid="import-plan-dialog"
    icon="fas fa-file-import"
    max-width="720"
    title="Import a plan"
  >
    <p class="mb-4 text-body-2">
      This replaces the plan in the tab you are on. You will be asked to confirm first if
      that tab already has factories in it.
    </p>

    <div class="d-flex flex-column flex-md-row ga-4">
      <v-card
        class="choice flex-1-1 pa-4"
        data-testid="import-from-file"
        :disabled="busy"
        role="button"
        :tabindex="busy ? -1 : 0"
        variant="tonal"
        @click="pickFile"
        @keydown.enter.prevent="pickFile"
        @keydown.space.prevent="pickFile"
      >
        <div class="text-h6 mb-2">
          <span class="mr-2"><i class="fas fa-file-upload" /></span>From a file
        </div>
        <p class="text-body-2">
          A <code>.json</code> plan saved from the planner, yours or somebody else's.
        </p>
      </v-card>

      <v-card
        class="choice flex-1-1 pa-4"
        data-testid="import-from-clipboard"
        :disabled="busy"
        role="button"
        :tabindex="busy ? -1 : 0"
        variant="tonal"
        @click="emit('clipboard')"
        @keydown.enter.prevent="emit('clipboard')"
        @keydown.space.prevent="emit('clipboard')"
      >
        <div class="text-h6 mb-2">
          <span class="mr-2"><i class="fas fa-clipboard" /></span>From the clipboard
        </div>
        <p class="text-body-2">
          A plan copied to your clipboard. Your browser may ask you to confirm the paste.
          Firefox in particular puts a <b>Paste</b> button near the pointer, and nothing
          arrives until you press it.
        </p>
      </v-card>
    </div>

    <!-- Hidden, and driven by the card above it: a file input styled to look like the
         card beside it is a fight nobody wins. -->
    <input
      ref="fileInput"
      accept="application/json,.json"
      class="d-none"
      data-testid="import-file-input"
      type="file"
      @change="onFileChosen"
    >

    <p v-if="error" class="mt-4 text-body-2 text-red" data-testid="import-error">{{ error }}</p>

    <template #actions>
      <v-btn :disabled="busy" variant="text" @click="open = false">Cancel</v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import AppDialog from '@/components/common/AppDialog.vue'

  /**
   * The two ways a plan comes back in. The clipboard half carries the warning it
   * needs: reading the clipboard is a permission, and some browsers ask for it with
   * a prompt of their own that the planner cannot see, dismiss or explain after the
   * fact, so it is said up front, next to the button that triggers it.
   */
  const open = defineModel<boolean>({ default: false })

  defineProps<{
    /** Shown inline: an import that fails must not close the dialog it failed in. */
    error?: string
    busy?: boolean
  }>()

  const emit = defineEmits<{ clipboard: [], file: [File] }>()

  const fileInput = ref<HTMLInputElement | null>(null)

  const pickFile = () => fileInput.value?.click()

  const onFileChosen = (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    // Cleared so choosing the same file twice in a row fires a change event both times.
    input.value = ''
    if (file) emit('file', file)
  }

  watch(open, isOpen => {
    if (!isOpen && fileInput.value) fileInput.value.value = ''
  })
</script>

<style lang="scss" scoped>
// Basis zero, so the pair share the row evenly rather than the wordier one taking
// the width its text asks for.
.choice {
  cursor: pointer;
  flex-basis: 0;
}

.choice:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
