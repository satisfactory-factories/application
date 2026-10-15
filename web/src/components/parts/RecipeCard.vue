<template>
  <v-card class="recipe-card border-md h-100" variant="flat">
    <v-card-title class="d-flex align-center flex-wrap py-2">
      <span class="text-h6" data-testid="recipe-card-name">{{ name }}</span>
      <v-chip
        v-if="recipe.isAlternate"
        class="ml-2"
        color="orange"
        size="small"
        variant="tonal"
      >
        Alternate
      </v-chip>
      <tooltip
        v-if="tier"
        :text="`${RECIPE_TIERS[tier].label} in ${RECIPE_RATINGS_SOURCE.title}.`"
      >
        <v-chip
          class="ml-2 recipe-tier"
          :data-testid="`recipe-card-tier-${tier}`"
          size="small"
          :style="{ backgroundColor: RECIPE_TIERS[tier].color }"
          variant="flat"
        >
          {{ tier }} tier<i class="fas fa-info-circle ml-1" />
        </v-chip>
      </tooltip>
      <v-chip
        v-if="recipe.isFicsmas"
        class="ml-2"
        color="green"
        size="small"
        variant="tonal"
      >
        FICSMAS
      </v-chip>
      <v-spacer />
      <v-btn
        color="primary"
        prepend-icon="fas fa-industry"
        size="small"
        variant="flat"
        @click="showAddDialog = true"
      >
        Add to Planner
      </v-btn>
      <add-to-planner-dialog v-model="showAddDialog" :recipe="recipe" />
    </v-card-title>
    <v-divider />
    <v-card-text class="text-body-1 pb-2">
      <div class="mb-2">
        <span class="font-weight-bold mr-2">Ingredients:</span>
        <v-chip
          v-for="ingredient in recipe.ingredients"
          :key="ingredient.part"
          class="sf-chip"
        >
          <game-asset
            clickable
            :subject="ingredient.part"
            type="item"
          />
          <span class="ml-2">
            <b>{{ getPartDisplayName(ingredient.part) }}</b>: {{ formatNumber(ingredient.perMin) }}/min
          </span>
        </v-chip>
      </div>
      <div class="mb-2">
        <span class="font-weight-bold mr-2">Products:</span>
        <v-chip
          v-for="product in recipe.products"
          :key="product.part"
          class="sf-chip"
          :class="product.isByProduct ? 'byproduct' : 'green'"
        >
          <game-asset
            clickable
            :subject="product.part"
            type="item"
          />
          <span class="ml-2">
            <b>{{ getPartDisplayName(product.part) }}</b>: {{ formatNumber(product.perMin) }}/min
            <span v-if="product.isByProduct"> (byproduct)</span>
          </span>
        </v-chip>
      </div>
      <div>
        <span class="font-weight-bold mr-2">Building:</span>
        <v-chip class="sf-chip cyan">
          <game-asset
            clickable
            :subject="recipe.building.name"
            type="building"
          />
          <span class="ml-2">
            <b>{{ getBuildingDisplayName(recipe.building.name) }}</b>
          </span>
        </v-chip>
        <v-chip class="sf-chip consumption">
          <i class="fas fa-bolt" />
          <span class="ml-2">{{ formatMw(recipe.building.power) }}</span>
        </v-chip>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import AddToPlannerDialog from '@/components/parts/AddToPlannerDialog.vue'
  import { Recipe } from '@/interfaces/Recipes'
  import { getPartDisplayName } from '@/utils/helpers'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'
  import { formatMw, formatNumber } from '@/utils/numberFormatter'
  import { getRecipeRating, RECIPE_RATINGS_SOURCE, RECIPE_TIERS } from '@/utils/recipe-ratings'

  const props = defineProps<{
    recipe: Recipe;
  }>()

  // The Alternate chip already says it, so the game's "Alternate: " prefix is dropped here.
  const name = computed(() => props.recipe.displayName.replace(/^Alternate:\s*/, ''))
  const tier = computed(() => props.recipe.isAlternate ? getRecipeRating(props.recipe.id) : undefined)

  const showAddDialog = ref(false)
</script>

<style lang="scss" scoped>
.recipe-card {
  background-color: rgb(33, 33, 33);
}

.recipe-tier {
  color: #fff;
  font-weight: 600;
}
</style>
