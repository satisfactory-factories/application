<template>
  <v-expansion-panel class="part-panel" :value="part.id">
    <v-expansion-panel-title>
      <game-asset
        clickable
        height="48"
        :subject="part.id"
        type="item"
        width="48"
      />
      <span class="ml-3 text-h6">{{ part.name }}</span>
      <v-chip
        v-if="part.isFicsmas"
        class="ml-3"
        color="green"
        size="small"
        variant="tonal"
      >
        FICSMAS
      </v-chip>
      <v-chip
        v-if="producedIn.length"
        class="ml-3"
        color="primary"
        prepend-icon="fas fa-check"
        size="small"
        variant="tonal"
      >
        In Plan - {{ formatNumber(totalProduced) }}/min
      </v-chip>
      <v-spacer />
      <span class="text-body-2 text-medium-emphasis mr-4">
        <span v-if="part.standardRecipes.length">{{ part.standardRecipes.length }} recipe{{ part.standardRecipes.length === 1 ? '' : 's' }}</span>
        <span v-if="part.alternateRecipes.length"> + {{ part.alternateRecipes.length }} alt</span>
        <span v-if="part.usedIn.length"> | used in {{ part.usedIn.length }} recipe{{ part.usedIn.length === 1 ? '' : 's' }}</span>
      </span>
    </v-expansion-panel-title>
    <v-expansion-panel-text>
      <div v-if="producedIn.length" class="mb-4">
        <h3 class="text-subtitle-1 font-weight-bold mb-2">
          <i class="fas fa-industry" />
          <span class="ml-2">Produced in your plan by</span>
        </h3>
        <v-chip
          v-for="factory in producedIn"
          :key="factory.id"
          class="sf-chip"
          color="primary"
          style="border-color: rgb(0, 123, 255) !important"
          :title="`Go to ${factory.name} in the Planner`"
          @click="jumpToFactory(factory.id)"
        >
          <i class="fas fa-industry" />
          <span class="ml-2">
            <b>{{ factory.name }}</b>: {{ formatNumber(factory.amount) }}/min
          </span>
        </v-chip>
      </div>
      <v-expansion-panels v-if="part.standardRecipes.length" v-model="producedByOpen" class="mb-3" variant="accordion">
        <v-expansion-panel class="part-accordion" value="produced-by">
          <v-expansion-panel-title class="text-subtitle-1">
            <i class="fas fa-hat-chef" />
            <span class="ml-2 font-weight-bold">Produced by ({{ part.standardRecipes.length }})</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row dense>
              <v-col
                v-for="recipe in part.standardRecipes"
                :key="recipe.id"
                cols="12"
                lg="4"
                md="6"
              >
                <recipe-card :recipe="recipe" />
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <p v-else class="text-body-2 text-medium-emphasis mb-2">
        <i class="fas fa-mountain" />
        <span class="ml-2">Not produced by any recipe (raw resource or collectible).</span>
      </p>
      <v-expansion-panels v-if="part.alternateRecipes.length" class="mb-3" variant="accordion">
        <v-expansion-panel class="part-accordion">
          <v-expansion-panel-title class="text-subtitle-1">
            <i class="fas fa-flask" />
            <span class="ml-2 font-weight-bold">Alternate Recipes ({{ part.alternateRecipes.length }})</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row dense>
              <v-col
                v-for="recipe in part.alternateRecipes"
                :key="recipe.id"
                cols="12"
                lg="4"
                md="6"
              >
                <recipe-card :recipe="recipe" />
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <v-expansion-panels v-if="part.usedIn.length" variant="accordion">
        <v-expansion-panel class="part-accordion">
          <v-expansion-panel-title class="text-subtitle-1">
            <i class="fas fa-cogs" />
            <span class="ml-2 font-weight-bold">Used in ({{ part.usedIn.length }})</span>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-row dense>
              <v-col
                v-for="recipe in part.usedIn"
                :key="recipe.id"
                cols="12"
                lg="4"
                md="6"
              >
                <recipe-card :recipe="recipe" />
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-expansion-panel-text>
  </v-expansion-panel>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import RecipeCard from '@/components/parts/RecipeCard.vue'
  import { PartEntry, PartProducer } from '@/utils/parts'
  import { formatNumber } from '@/utils/numberFormatter'

  const props = defineProps<{
    part: PartEntry;
    producedIn: PartProducer[];
  }>()

  const producedByOpen = ref('produced-by')

  const totalProduced = computed(() => props.producedIn.reduce((total, factory) => total + factory.amount, 0))

  const router = useRouter()

  // The Planner picks this up in showPlan() and scrolls to the factory once rendered.
  const jumpToFactory = (factoryId: number) => {
    sessionStorage.setItem('navigateToFactory', String(factoryId))
    router.push('/')
  }
</script>

<style lang="scss" scoped>
.part-accordion {
  background-color: rgb(50, 50, 50);
  border: 1px solid rgb(108, 108, 108);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.part-panel {
  background-color: #252525;
}
</style>
