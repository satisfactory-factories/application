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
