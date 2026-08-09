<template>
  <!-- Both wrappers are inline-flex: an inline box is baseline-aligned and taller than the
       icon inside it, so the slot content never lines up with controls sitting beside it.
       Every usage wraps a single icon, image, chip or button — never flowing text. -->
  <span class="d-inline-flex align-center" :class="classes">
    <v-tooltip>
      <template #activator="{ props }">
        <span class="d-inline-flex align-center" v-bind="props">
          <slot />
        </span>
      </template>
      <span v-html="text" />
    </v-tooltip>
  </span>
</template>

<script setup lang="ts">

  defineProps<{
    text: string
    classes?: string
  }>()
</script>
