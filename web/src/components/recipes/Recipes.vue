<template>
  <Todo />
  <v-card>
    <v-card-title class="py-4">
      <h1 class="text-h4">Recipes</h1>
    </v-card-title>
    <v-divider />
    <v-card-text>
      <v-text-field v-model="searchTerm" label="Recipe name" />
      <div class="mb-4">
        <v-chip
          class="mr-2"
          color="primary"
          :variant="showAltRecipes ? 'flat' : 'outlined'"
          @click="toggleAltRecipes"
        >
          Show Alt Recipes
        </v-chip>
        <v-chip color="primary" :variant="showFicsmas ? 'flat' : 'outlined'" @click="toggleFicsmas">
          Show FICSMAS
        </v-chip>
      </div>
      <v-expansion-panels multiple>
        <recipe-search-item v-for="recipe in filteredRecipes" :key="recipe.id" :recipe="recipe" />
      </v-expansion-panels>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import RecipeSearchItem from './RecipeSearchItem.vue'
  import { Recipe } from '@/interfaces/Recipes'
  import { DataInterface } from '@/interfaces/DataInterface'
  import Todo from '@/components/recipes/Todo.vue'

  // Props
  const props = defineProps<{
    gameData: DataInterface;
  }>()

  // Reactive State
  const searchTerm = ref<string>('')
  const showAltRecipes = ref<boolean>(false)
  const showFicsmas = ref<boolean>(false)

  // Computed Property
  const filteredRecipes = computed<Recipe[]>(() => {
    let filtered = props.gameData.recipes

    if (searchTerm.value) {
      filtered = filtered.filter(recipe =>
        recipe.displayName.toLowerCase().includes(searchTerm.value.toLowerCase())
      )
    }

    filtered = filtered.filter(recipe => {
      // Filter out alternate recipes if `showAltRecipes` is false
      if (!showAltRecipes.value && recipe.isAlternate) {
        return false
      }

      // Filter out Ficsmas recipes if `showFicsmas` is false
      if (!showFicsmas.value && recipe.isFicsmas) {
        return false
      }

      // If the recipe passed all conditions, include it
      return true
    })

    return filtered
  })

  const toggleAltRecipes = () => {
    showAltRecipes.value = !showAltRecipes.value
  }
  const toggleFicsmas = () => {
    showFicsmas.value = !showFicsmas.value
  }
</script>

<style scoped>
ul {
  list-style-type: none;
  padding: 0;
}

li {
  margin-bottom: 10px;
}
</style>
