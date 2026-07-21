<template>
  <v-btn class="ml-2 bg-indigo-darken-2 discord-btn" href="https://discord.gg/zge68PrGJ7" target="_blank"><i class="fab fa-discord" /><span class="ml-2">{{ showText }}</span></v-btn>
</template>

<script setup lang="ts">
  // Property to change text

  const props = defineProps<{
    text?: string
  }>()

  const showText = props.text ?? 'Discord'
</script>

<style scoped lang="scss">
// Vuetify's `border` utility is a barely-visible hairline — the Discord call to
// action warrants an actual visible outline against the indigo fill.
.discord-btn {
  border: 2px solid #5c6bc0;
}
</style>
