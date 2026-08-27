<template>
  <v-img
    class="cursor-pointer"
    max-width="200px"
    src="/assets/img/support_me_on_kofi_dark.webp"
    width="200px"
    @click="open = true"
  />
  <app-dialog
    v-model="open"
    icon="fas fa-heart"
    max-width="480"
    title="Help support the project!"
  >
    Thank you for considering a donation! Any amount of support is vastly
    appreciated and helps keep the project running and improving. ❤️
    <template #actions>
      <v-spacer />
      <v-btn
        color="blue"
        href="https://ko-fi.com/maelstrome"
        prepend-icon="fas fa-mug-hot"
        rel="noopener noreferrer"
        target="_blank"
        text="Donate on Ko-fi"
        variant="flat"
        @click="open = false"
      />
      <v-spacer />
    </template>
  </app-dialog>
</template>
<script setup lang="ts">
  const open = ref(false)
</script>
