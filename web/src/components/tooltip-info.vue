<template>
  <span class="ml-2" :class="classOverrides()">
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
  import { defineProps, withDefaults } from 'vue'

  const propsComp = withDefaults(defineProps<{
    text: string
    classes?: string
    isCaption?: boolean
  }>(), {
    isCaption: true,
  })

  const classOverrides = () => {
    return {
      'text-caption': propsComp.isCaption ?? true,
      'text-grey': propsComp.isCaption ?? true,
      ...(propsComp.classes ? propsComp.classes.split(' ').reduce((acc, cur) => ({ ...acc, [cur]: true }), {}) : {}),
    }
  }
</script>
