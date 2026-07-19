<template>
  <v-container />
</template>

<script setup lang="ts">
  // Legacy route: the recipes page is now the item-centric parts browser.
  import { useRouter } from 'vue-router'

  useRouter().replace('/parts')
</script>
