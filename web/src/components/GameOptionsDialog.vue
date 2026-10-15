<template>
  <!-- 40px tall like the Options button beside it, for the reason given there. -->
  <v-btn
    id="game-options-button"
    color="grey-darken-1 rounded"
    data-testid="game-options"
    height="40"
    prepend-icon="fas fa-gamepad"
    variant="flat"
    @click="open = true"
  >
    Game options
  </v-btn>
  <!-- Held open while reading: closing mid-read would land the result on whichever tab is current
       by then. -->
  <app-dialog
    v-model="open"
    body-max-height="70vh"
    :closable="!busy"
    data-testid="game-options-dialog"
    icon="fas fa-gamepad"
    max-width="820"
    :persistent="busy"
    scrollable
    title="Game options"
  >
    <h3 class="text-subtitle-1 font-weight-bold mb-1">Your game save</h3>
    <p class="mb-3 text-medium-emphasis">
      Load a Satisfactory save to check this plan against it. Recipes and buildings the save has not
      unlocked get a padlock, and any factory using one is flagged. The save is read in this
      browser and is never uploaded. Only what it has unlocked is kept, and it stays with this plan.
    </p>

    <v-sheet v-if="save" class="pa-3 mb-3 rounded" color="surface-light" data-testid="loaded-save">
      <div class="d-flex align-center flex-wrap ga-2">
        <span><i class="fas fa-save" /></span>
        <b>{{ save.name || 'Unnamed save' }}</b>
        <span class="text-medium-emphasis">read {{ readAt }}</span>
      </div>
      <div class="d-flex align-center flex-wrap ga-1 mt-2" data-testid="loaded-save-tiers">
        <span class="mr-1">Tiers</span>
        <span
          v-for="tier in TIERS"
          :key="tier"
          class="tier-chip"
          :class="{ reached: save.tiers.includes(tier) }"
          :title="save.tiers.includes(tier) ? `Tier ${tier} reached` : `Tier ${tier} not reached yet`"
        >{{ tier }}</span>
      </div>
      <div class="mt-2" data-testid="loaded-save-summary">{{ summary }}</div>
    </v-sheet>

    <div v-if="busy" class="mb-3" data-testid="reading-save">
      <div class="mb-2">Reading {{ fileName }}...</div>
      <v-progress-linear color="primary" indeterminate rounded />
    </div>

    <p v-if="error" class="mb-3 text-red" data-testid="load-save-error">{{ error }}</p>

    <div class="d-flex align-center flex-wrap ga-2 mb-3">
      <v-btn
        color="primary"
        data-testid="select-save"
        :loading="busy"
        prepend-icon="fas fa-file-upload"
        variant="flat"
        @click="fileInput?.click()"
      >
        {{ save ? 'Load a newer save' : 'Load game save' }}
      </v-btn>
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
    </div>

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

    <v-divider class="my-4" />

    <h3 class="text-subtitle-1 font-weight-bold mb-1">Alternate recipes</h3>
    <p v-if="!save" class="mb-0 text-medium-emphasis" data-testid="alternates-need-save">
      Load a save to see which alternates you have unlocked, and to change them.
    </p>
    <template v-else>
      <p class="mb-3 text-medium-emphasis">
        Click a recipe to mark it unlocked or locked by hand. Marks are kept when you load a newer save.
      </p>
      <div class="d-flex align-center flex-wrap ga-2 mb-2">
        <v-text-field
          v-model="search"
          class="alternate-search"
          clearable
          data-testid="alternate-search"
          density="compact"
          hide-details
          label="Search alternates"
          prepend-inner-icon="fas fa-search"
          variant="outlined"
        />
        <v-btn-toggle v-model="filter" density="compact" mandatory variant="outlined">
          <v-btn value="all">All</v-btn>
          <v-btn data-testid="filter-unlocked" value="unlocked">Unlocked</v-btn>
          <v-btn data-testid="filter-locked" value="locked">Locked</v-btn>
        </v-btn-toggle>
      </div>
      <div class="alternate-list" data-testid="alternate-list">
        <button
          v-for="recipe in shownAlternates"
          :key="recipe.id"
          class="alternate-row"
          :class="{ locked: !recipe.unlocked, overridden: recipe.overridden }"
          :data-recipe="recipe.id"
          type="button"
          @click="setUnlocked(recipe.id, !recipe.unlocked)"
        >
          <!-- Wrapped: Font Awesome swaps the <i> for an <svg> Vue no longer owns. -->
          <span class="alternate-lock">
            <span v-if="recipe.unlocked" key="unlocked"><i class="fas fa-lock-open" /></span>
            <span v-else key="locked"><i class="fas fa-lock" /></span>
          </span>
          <span class="alternate-name">{{ recipe.name }}</span>
          <span v-if="recipe.overridden" class="alternate-note text-caption">set by hand</span>
          <recipe-picker-tags :alternate="false" :tier="recipe.tier" />
        </button>
        <p v-if="!shownAlternates.length" class="pa-3 mb-0 text-medium-emphasis">No alternates match.</p>
      </div>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import RecipePickerTags from '@/components/planner/products/RecipePickerTags.vue'
  import { useRecipeUnlocks } from '@/composables/useRecipeUnlocks'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { IncompatibleSaveError, readSaveFile } from '@/utils/game-save/read-save-file'
  import { getRecipeRating } from '@/utils/recipe-ratings'
  import { saveFromWorld } from '@/utils/recipe-unlocks'
  import eventBus from '@/utils/eventBus'

  const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  const open = ref(false)
  const { save, overrides, isUnlocked, isOverridden, setUnlocked, loadSave, forgetSave } = useRecipeUnlocks()
  const gameDataStore = useGameDataStore()

  const fileInput = ref<HTMLInputElement | null>(null)
  const busy = ref(false)
  const error = ref('')
  const fileName = ref('')
  const search = ref<string | null>('')
  const filter = ref<'all' | 'unlocked' | 'locked'>('all')

  const recipeIds = computed(() => (gameDataStore.gameData?.recipes ?? []).map(recipe => recipe.id))
  const buildingIds = computed(() => Object.keys(gameDataStore.gameData?.buildings ?? {}))

  const alternates = computed(() => (gameDataStore.gameData?.recipes ?? [])
    .filter(recipe => recipe.isAlternate)
    .map(recipe => ({
      id: recipe.id,
      name: recipe.displayName.replace(/^Alternate:\s*/, ''),
      tier: getRecipeRating(recipe.id),
      unlocked: isUnlocked(recipe.id),
      overridden: isOverridden(recipe.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)))

  const shownAlternates = computed(() => {
    const query = (search.value ?? '').trim().toLowerCase()
    return alternates.value.filter(recipe =>
      (!query || recipe.name.toLowerCase().includes(query)) &&
      (filter.value === 'all' || (filter.value === 'unlocked') === recipe.unlocked)
    )
  })

  const unlockedRecipeCount = computed(() => recipeIds.value.filter(id => isUnlocked(id)).length)
  const unlockedAlternateCount = computed(() => alternates.value.filter(recipe => recipe.unlocked).length)
  const overrideCount = computed(() => Object.keys(overrides.value).length)
  const readAt = computed(() => save.value ? new Date(save.value.readAt).toLocaleString() : '')

  const summary = computed(() => [
    `${unlockedRecipeCount.value} of ${recipeIds.value.length} recipes unlocked, including ${unlockedAlternateCount.value} of ${alternates.value.length} alternates.`,
    `${save.value?.buildings.length ?? 0} buildings unlocked.`,
    overrideCount.value ? `${overrideCount.value} marked by hand.` : '',
  ].filter(Boolean).join(' '))

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
      const world = await readSaveFile(file, buildingIds.value)
      const next = saveFromWorld(world, recipeIds.value)
      if (!next.name) next.name = file.name.replace(/\.sav$/i, '')
      loadSave(next)
      eventBus.emit('toast', {
        message: `Loaded "${next.name}": ${unlockedRecipeCount.value} of ${recipeIds.value.length} recipes unlocked.`,
        type: 'success',
      })
    } catch (cause) {
      console.error('GameOptionsDialog: could not read the save', cause)
      error.value = cause instanceof IncompatibleSaveError
        ? `That save is not compatible. ${cause.reason}`
        : 'That save could not be read. Try loading it again.'
    } finally {
      busy.value = false
    }
  }

  const forget = () => {
    forgetSave()
    eventBus.emit('toast', { message: 'Save forgotten. Everything counts as unlocked again.', type: 'info' })
  }
</script>

<style lang="scss" scoped>
.tier-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 12px;
  font-weight: 600;
  opacity: 0.45;

  &.reached {
    background: var(--sf-success);
    border-color: var(--sf-success);
    color: #fff;
    opacity: 1;
  }
}

.alternate-search {
  flex: 1 1 220px;
}

.alternate-list {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}

.alternate-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  &:last-child {
    border-bottom: 0;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  &.locked .alternate-name {
    opacity: 0.5;
  }
}

.alternate-lock {
  display: inline-flex;
  justify-content: center;
  width: 16px;
  font-size: 13px;
  opacity: 0.6;

  .locked & {
    color: var(--sf-status-warning);
    opacity: 1;
  }

  .overridden:not(.locked) & {
    color: var(--sf-success);
    opacity: 1;
  }
}

.alternate-name {
  flex: 1;
  min-width: 0;
}

.alternate-note {
  opacity: 0.7;
}
</style>
