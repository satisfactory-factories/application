<template>
  <v-expansion-panel>
    <v-expansion-panel-title>
      <game-asset
        height="48"
        :subject="recipe.products[0].part"
        type="item"
        width="48"
      />
      <span class="ml-3 text-h6">{{ recipe.displayName }}</span>
    </v-expansion-panel-title>
    <v-expansion-panel-text>
      <recipe-item :recipe="recipe" />
    </v-expansion-panel-text>
  </v-expansion-panel>
</template>

<script setup lang="ts">
  import RecipeItem from './RecipeItem.vue'
  import { Recipe } from '@/interfaces/Recipes'

  defineProps<{
    recipe: Recipe;
  }>()
</script>
