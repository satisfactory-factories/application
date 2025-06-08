<template>
  <span :class="classes">
    <v-tooltip>
      <template #activator="{ props }">
        <span v-bind="props">
          <slot />
        </span>
      </template>
      <span v-html="text" />
    </v-tooltip>
  </span>
</template>

<script setup lang="ts">
  import { defineProps } from 'vue'

  defineProps<{
    text: string
    classes?: string
  }>()
</script>
