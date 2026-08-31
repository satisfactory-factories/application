<template>
  <v-card class="factory-card sub-card">
    <v-card-title>
      <i class="fas fa-sticky-note" />
      <span class="text-h5 ml-3">Notes</span>
    </v-card-title>
    <v-card-text>
      <v-textarea
        v-model="factory.notes"
        auto-grow
        class="notes-field"
        :class="{ 'notes-locked': lockedByPeer }"
        :counter="charLimit"
        :disabled="lockedByPeer"
        error-messages=""
        :messages="lockHint"
        placeholder="Add some notes!"
        rows="1"
        :rules="[rules.length]"
        @blur="release"
        @focus="claim"
        @update:model-value="noteEdited"
      />
      <v-btn
        v-if="factory.notes.length > 0"
        class="mt-1"
        color="primary"
        :disabled="lockedByPeer"
        @click="clearNotes"
      >Clear Notes</v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { Factory } from '@/interfaces/planner/FactoryInterface'
  import { useFieldLock } from '@/composables/useFieldLock'
  import { useAppStore } from '@/stores/app-store'
  import eventBus from '@/utils/eventBus'

  const props = defineProps <{
    factory: Factory;
  }>()

  // Validation rule for the character limit
  const rules = {
    length: () => {
      // Check if the value length exceeds the character limit
      if (props.factory.notes.length >= charLimit) {
        props.factory.notes = props.factory.notes.slice(0, charLimit) // Trim the value
        return `Max character length (${charLimit}) reached, condense your notes, pioneer!`
      }
      return true // Validation passes
    },
  }

  const charLimit = 1000

  const appStore = useAppStore()

  // The first field on the advisory lock protocol. The key is opaque to the server,
  // so another field is a second call to this and nothing else.
  const {
    disabled: lockedByPeer,
    hint: lockHint,
    claim,
    renew,
    release,
  } = useFieldLock(() => appStore.getCurrentTab()?.id ?? null, () => `notes:${props.factory.id}`)

  watch(() => props.factory.notes, () => {
    eventBus.emit('factoryUpdated', props.factory) // Tell sync there's something changed
  })

  /**
   * Intent, separate from the watcher above on purpose. A rebase only carries over
   * factories the user touched, so an unsent note needs this or it is discarded —
   * but the watcher also fires when an inbound op rewrites the note, and claiming
   * that as intent would make this client overlay a peer's edit for ever.
   */
  const noteEdited = () => {
    renew()
    eventBus.emit('factoryEdited', props.factory)
  }

  const clearNotes = () => {
    props.factory.notes = ''
    noteEdited()
  }
</script>

<style lang="scss" scoped>
// Vuetify dims a disabled input's details row to 38%, which is too faint for the one
// line explaining why the field will not take a keystroke.
.notes-locked :deep(.v-input__details) {
  opacity: 1;
}

.notes-locked :deep(.v-messages__message) {
  color: var(--sf-warning);
}
</style>
