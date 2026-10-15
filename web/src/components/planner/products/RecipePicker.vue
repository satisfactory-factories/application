<template>
  <v-autocomplete
    v-bind="$attrs"
    class="recipe-picker"
    :custom-filter="filterRecipe"
    data-testid="recipe-picker"
    hide-details
    :items="items"
    label="Recipe"
    :model-value="modelValue"
    variant="outlined"
    @update:focused="focused = $event"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #selection="{ item }">
      <span class="recipe-picker-selection" :class="{ locked: item.locked }">
        <span v-if="item.locked" class="recipe-picker-selection-lock" data-testid="recipe-selection-locked">
          <i class="fas fa-lock" />
        </span>
        <span class="recipe-picker-name">{{ item.name }}</span>
        <span class="recipe-picker-selection-tags" :class="{ hidden: focused }">
          <recipe-picker-tags :alternate="item.alternate" :tier="item.tier" />
        </span>
      </span>
    </template>
    <template #item="{ props: itemProps, item }">
      <v-list-item v-bind="itemProps" :data-recipe="item.value" title="">
        <span class="recipe-picker-row" :class="{ locked: item.locked }">
          <span class="recipe-picker-name">{{ item.name }}</span>
          <recipe-picker-tags :alternate="item.alternate" :tier="item.tier" />
          <!-- Only once a save is loaded: until then nothing is locked, so there is nothing to say. -->
          <tooltip v-if="save" :text="lockTooltip(item)">
            <button
              class="recipe-picker-lock"
              :class="{ locked: item.locked, overridden: item.overridden }"
              :data-testid="`recipe-lock-${item.value}`"
              type="button"
              @click.stop="toggle(item.value)"
              @mousedown.stop
            >
              <!-- Wrapped: Font Awesome swaps the <i> for an <svg> Vue no longer owns. -->
              <span v-if="item.locked" key="locked"><i class="fas fa-lock" /></span>
              <span v-else key="unlocked"><i class="fas fa-lock-open" /></span>
            </button>
          </tooltip>
        </span>
      </v-list-item>
    </template>
    <template v-if="hasRatings" #append-item>
      <div class="recipe-picker-source text-caption text-medium-emphasis">
        Alternate ratings from
        <a :href="RECIPE_RATINGS_SOURCE.url" rel="noopener" target="_blank">{{ RECIPE_RATINGS_SOURCE.title }}</a>
        <div class="recipe-picker-legend" data-testid="recipe-tier-legend">
          <span>Best</span>
          <recipe-picker-tags v-for="tier in TIER_ORDER" :key="tier" :alternate="false" :tier="tier" />
          <span>Worst</span>
        </div>
      </div>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { getRecipeRating, matchesRecipeQuery, RECIPE_RATINGS_SOURCE, RecipeTier, TIER_ORDER } from '@/utils/recipe-ratings'
  import { useRecipeUnlocks } from '@/composables/useRecipeUnlocks'
  import type { FilterFunction } from 'vuetify'

  defineOptions({ inheritAttrs: false })

  const props = defineProps<{
    part: string
    modelValue: string
  }>()

  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

  const { getRecipesForPart } = useGameDataStore()
  const { save, isUnlocked, isOverridden, toggle } = useRecipeUnlocks()

  // `title` keeps the game's full name so typing "alt" still finds every alternate.
  // Standard recipes first, then alternates best tier first, unrated last.
  const items = computed(() => getRecipesForPart(props.part)
    .map(recipe => ({
      title: recipe.displayName,
      value: recipe.id,
      name: recipe.displayName.replace(/^Alternate:\s*/, ''),
      alternate: recipe.displayName.startsWith('Alternate'),
      tier: getRecipeRating(recipe.id),
      locked: !isUnlocked(recipe.id),
      overridden: isOverridden(recipe.id),
    }))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)))

  const rank = (item: { alternate: boolean, tier?: RecipeTier }) =>
    !item.alternate ? -1 : item.tier ? TIER_ORDER.indexOf(item.tier) : TIER_ORDER.length

  const filterRecipe: FilterFunction = (_value, query, item) =>
    matchesRecipeQuery(item?.raw.title ?? '', item?.raw.tier, query)

  // The tags step aside while typing, or the search text wraps the field onto a second line.
  const focused = ref(false)

  const hasRatings = computed(() => items.value.some(item => item.tier))

  const lockTooltip = (item: { locked: boolean, overridden: boolean }) => {
    const saveName = save.value?.name ? `"${save.value.name}"` : 'your save'
    if (item.overridden) {
      return item.locked
        ? `Marked locked by hand. Click to go back to what ${saveName} says.`
        : `Marked unlocked by hand. Click to go back to what ${saveName} says.`
    }
    return item.locked
      ? `Not unlocked in ${saveName} yet. Click to mark it unlocked.`
      : `Unlocked in ${saveName}. Click to mark it locked.`
  }
</script>

<style lang="scss" scoped>
.recipe-picker-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
}

.recipe-picker :deep(.v-field__input) {
  flex-wrap: nowrap;
}

.recipe-picker-selection {
  display: flex;
  align-items: center;
  min-width: 0;
}

.recipe-picker-selection-tags {
  display: inline-flex;
  gap: 6px;
  margin-left: 6px;
  max-width: 80px;
  opacity: 1;
  overflow: hidden;
  transition: opacity 0.15s ease, max-width 0.15s ease, margin-left 0.15s ease;

  &.hidden {
    margin-left: 0;
    max-width: 0;
    opacity: 0;
  }
}

.recipe-picker-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-picker-row.locked > .recipe-picker-name,
.recipe-picker-selection.locked > .recipe-picker-name {
  opacity: 0.5;
}

.recipe-picker-lock {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 13px;
  opacity: 0.35;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    opacity: 1;
  }

  &.locked {
    color: var(--sf-status-warning);
    opacity: 1;
  }

  // Unlocked by hand: shown at full strength, so a mark that disagrees with the save stands out.
  &.overridden:not(.locked) {
    color: var(--sf-success);
    opacity: 1;
  }
}

.recipe-picker-selection-lock {
  display: inline-flex;
  flex-shrink: 0;
  margin-right: 6px;
  font-size: 12px;
  color: var(--sf-status-warning);
}

.recipe-picker-source {
  padding: 8px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  text-align: center;
}

.recipe-picker-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 6px;
}
</style>
