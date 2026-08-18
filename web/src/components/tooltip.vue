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
      <!-- Escaped: `text` is built from plan data (part ids, factory names), which a share
           link controls. See safeHtml. -->
      <span v-html="safeHtml(text)" />
    </v-tooltip>
  </span>
</template>

<script setup lang="ts">
  import { safeHtml } from '@/utils/safeHtml'

  defineProps<{
    text: string
    classes?: string
  }>()
</script>
