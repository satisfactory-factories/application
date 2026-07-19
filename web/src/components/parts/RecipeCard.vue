<template>
  <v-card class="recipe-card sub-card border-md mb-3" variant="flat">
    <v-card-title class="d-flex align-center flex-wrap py-2">
      <span class="text-h6">{{ recipe.displayName }}</span>
      <v-chip
        v-if="recipe.isAlternate"
        class="ml-2"
        color="orange"
        size="small"
        variant="tonal"
      >
        Alternate
      </v-chip>
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
          :class="product.isByProduct ? 'orange' : 'green'"
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
        <v-chip class="sf-chip yellow">
          <i class="fas fa-bolt" />
          <span class="ml-2">{{ formatPower(recipe.building.power).value }} {{ formatPower(recipe.building.power).unit }}</span>
        </v-chip>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import AddToPlannerDialog from '@/components/parts/AddToPlannerDialog.vue'
  import { Recipe } from '@/interfaces/Recipes'
  import { getPartDisplayName } from '@/utils/helpers'
  import { getBuildingDisplayName } from '@/utils/factory-management/common'
  import { formatNumber, formatPower } from '@/utils/numberFormatter'

  defineProps<{
    recipe: Recipe;
  }>()

  const showAddDialog = ref(false)
</script>
