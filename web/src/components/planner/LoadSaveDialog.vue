<template>
  <!-- Held open while reading: closing mid-read would leave the result landing on a dialog nobody
       can see, or on whichever tab is current by then. -->
  <app-dialog
    v-model="open"
    :closable="!busy"
    data-testid="load-save-dialog"
    icon="fas fa-save"
    max-width="640"
    :persistent="busy"
    title="Load your save"
  >
    <p class="mb-3">
      Load a Satisfactory save to see which alternate recipes you have unlocked. Locked ones get a
      padlock in the recipe list, and any factory using one is flagged.
    </p>
    <p class="mb-4 text-medium-emphasis">
      The save is read in this browser and is never uploaded. Only the list of unlocked alternates
      is kept, and it stays with this plan.
    </p>

    <v-sheet v-if="save" class="pa-3 mb-4 rounded" color="surface-light" data-testid="loaded-save">
      <div class="d-flex align-center">
        <span class="mr-2"><i class="fas fa-save" /></span>
        <b>{{ save.name || 'Unnamed save' }}</b>
        <span class="ml-2 text-medium-emphasis">read {{ readAt }}</span>
      </div>
      <div class="mt-1" data-testid="loaded-save-summary">
        {{ save.alternates.length }} of {{ alternateCount }} alternate recipes unlocked in this save<span v-if="overrideCount">, and {{ overrideCount }} marked by hand</span>.
      </div>
    </v-sheet>

    <div v-if="busy" class="mb-4" data-testid="reading-save">
      <div class="mb-2">Reading {{ fileName }}...</div>
      <v-progress-linear color="primary" indeterminate rounded />
    </div>

    <p v-if="error" class="mb-4 text-red" data-testid="load-save-error">{{ error }}</p>

    <p class="mb-0 text-medium-emphasis">
      Saves live in <code>%LOCALAPPDATA%\FactoryGame\Saved\SaveGames</code> on Windows. Can't find
      yours? See <a href="https://satisfactory.wiki.gg/wiki/Save_files#Save_file_location" rel="noopener" target="_blank">Save file location</a> on the wiki.
    </p>

    <input
      ref="fileInput"
      accept=".sav"
      class="d-none"
      data-testid="load-save-input"
      type="file"
      @change="onFileChosen"
    >

    <template #actions>
      <v-btn
        v-if="save"
        color="red"
        data-testid="forget-save"
        :disabled="busy"
        variant="text"
        @click="forget"
      >
        Forget save
      </v-btn>
      <v-spacer />
      <v-btn :disabled="busy" variant="text" @click="open = false">Close</v-btn>
      <v-btn
        color="primary"
        data-testid="select-save"
        :loading="busy"
        prepend-icon="fas fa-file-upload"
        variant="flat"
        @click="fileInput?.click()"
      >
        {{ save ? 'Load a newer save' : 'Select save (.sav)' }}
      </v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRecipeUnlocks } from '@/composables/useRecipeUnlocks'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { readSaveFile } from '@/utils/game-save/read-save-file'
  import { saveFromWorld } from '@/utils/recipe-unlocks'
  import eventBus from '@/utils/eventBus'

  const open = defineModel<boolean>({ default: false })

  const { save, overrides, loadSave, forgetSave } = useRecipeUnlocks()
  const gameDataStore = useGameDataStore()

  const fileInput = ref<HTMLInputElement | null>(null)
  const busy = ref(false)
  const error = ref('')
  const fileName = ref('')

  const alternateIds = computed(() =>
    (gameDataStore.gameData?.recipes ?? []).filter(recipe => recipe.isAlternate).map(recipe => recipe.id)
  )
  const alternateCount = computed(() => alternateIds.value.length)
  const overrideCount = computed(() => Object.keys(overrides.value).length)
  const readAt = computed(() => save.value ? new Date(save.value.readAt).toLocaleString() : '')

  const onFileChosen = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    // Cleared so picking the same file again still fires a change.
    input.value = ''
    if (!file) return

    busy.value = true
    error.value = ''
    fileName.value = file.name
    try {
      const world = await readSaveFile(file)
      const next = saveFromWorld(world, alternateIds.value)
      if (!next.name) next.name = file.name.replace(/\.sav$/i, '')
      loadSave(next)
      eventBus.emit('toast', {
        message: `Loaded "${next.name}": ${next.alternates.length} of ${alternateCount.value} alternate recipes unlocked.`,
        type: 'success',
      })
      open.value = false
    } catch (cause) {
      console.error('LoadSaveDialog: could not read the save', cause)
      error.value = `That save could not be read. ${cause instanceof Error ? cause.message : ''}`.trim()
    } finally {
      busy.value = false
    }
  }

  const forget = () => {
    forgetSave()
    eventBus.emit('toast', { message: 'Save forgotten. Every recipe counts as unlocked again.', type: 'info' })
  }
</script>
