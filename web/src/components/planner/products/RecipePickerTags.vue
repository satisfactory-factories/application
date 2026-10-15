<template>
  <span v-if="alternate" class="recipe-tag alt" data-testid="recipe-alt-tag">Alt</span>
  <span
    v-if="tier"
    class="recipe-tag tier"
    :data-testid="`recipe-tier-${tier}`"
    :style="{ backgroundColor: RECIPE_TIERS[tier].color }"
    :title="`${tier} tier: ${RECIPE_TIERS[tier].label}`"
  >{{ tier }}</span>
</template>

<script setup lang="ts">
  import { RECIPE_TIERS, RecipeTier } from '@/utils/recipe-ratings'

  defineProps<{
    alternate: boolean
    tier?: RecipeTier
  }>()
</script>

<style lang="scss" scoped>
.recipe-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: #fff;

  &.alt {
    border: 1px solid var(--sf-node-setting-border);
    color: var(--sf-node-setting);
  }

  &.tier {
    min-width: 20px;
  }
}
</style>
