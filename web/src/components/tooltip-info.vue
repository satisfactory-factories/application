<template>
  <span class="ml-2 text-caption text-grey" :class="classes">
    <v-tooltip>
      <template #activator="{ props }">
        <span v-bind="props">
          <v-icon
            icon="fas fa-info-circle"
          />
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
