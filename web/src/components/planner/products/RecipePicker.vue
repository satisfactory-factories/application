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
      <span class="recipe-picker-selection">
        <span class="recipe-picker-name">{{ item.name }}</span>
        <span class="recipe-picker-selection-tags" :class="{ hidden: focused }">
          <recipe-picker-tags :alternate="item.alternate" :tier="item.tier" />
        </span>
      </span>
    </template>
    <template #item="{ props: itemProps, item }">
      <v-list-item v-bind="itemProps" :data-recipe="item.value" title="">
        <span class="recipe-picker-row">
          <span class="recipe-picker-name">{{ item.name }}</span>
          <recipe-picker-tags :alternate="item.alternate" :tier="item.tier" />
          <i class="fas fa-check recipe-picker-check" :class="{ invisible: item.value !== modelValue }" />
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
  import type { FilterFunction } from 'vuetify'

  defineOptions({ inheritAttrs: false })

  const props = defineProps<{
    part: string
    modelValue: string
  }>()

  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

  const { getRecipesForPart } = useGameDataStore()

  // `title` keeps the game's full name so typing "alt" still finds every alternate.
  // Standard recipes first, then alternates best tier first, unrated last.
  const items = computed(() => getRecipesForPart(props.part)
    .map(recipe => ({
      title: recipe.displayName,
      value: recipe.id,
      name: recipe.displayName.replace(/^Alternate:\s*/, ''),
      alternate: recipe.displayName.startsWith('Alternate'),
      tier: getRecipeRating(recipe.id),
    }))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)))

  const rank = (item: { alternate: boolean, tier?: RecipeTier }) =>
    !item.alternate ? -1 : item.tier ? TIER_ORDER.indexOf(item.tier) : TIER_ORDER.length

  const filterRecipe: FilterFunction = (_value, query, item) =>
    matchesRecipeQuery(item?.raw.title ?? '', item?.raw.tier, query)

  // The tags step aside while typing, or the search text wraps the field onto a second line.
  const focused = ref(false)

  const hasRatings = computed(() => items.value.some(item => item.tier))
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

.recipe-picker-check {
  color: var(--sf-success);
  width: 14px;
  flex-shrink: 0;

  &.invisible {
    visibility: hidden;
  }
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
