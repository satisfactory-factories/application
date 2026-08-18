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
      <!-- Escaped: see safeHtml. Plan-supplied names reach these strings. -->
      <span v-html="safeHtml(text)" />
    </v-tooltip>
  </span>
</template>

<script setup lang="ts">
  import { safeHtml } from '@/utils/safeHtml'

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

<style scoped>
.v-icon {
  /* Vuetify's inline-flex + middle sinks the glyph ~3px below the surrounding text's baseline;
     FontAwesome's own -0.125em shim centres it optically against the text. */
  vertical-align: -0.125em;
}
</style>
