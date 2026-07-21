<template>
  <v-img
    class="cursor-pointer"
    max-width="200px"
    src="/assets/img/support_me_on_kofi_dark.webp"
    width="200px"
    @click="open = true"
  />
  <v-dialog
    v-model="open"
    width="auto"
  >
    <v-card
      prepend-icon="fas fa-heart"
      title="Help support the project!"
      width="400"
    >
      <template #append>
        <v-btn
          icon="fas fa-times"
          size="small"
          variant="text"
          @click="open = false"
        />
      </template>
      <div class="pa-4 text-body-1">
        Thank you for considering a donation! Any amount of support is vastly
        appreciated and helps keep the project running and improving. ❤️
      </div>
      <template #actions>
        <v-btn
          class="mx-auto mb-4"
          color="blue"
          href="https://ko-fi.com/maelstrome"
          prepend-icon="fas fa-mug-hot"
          rel="noopener noreferrer"
          target="_blank"
          text="Donate on Ko-fi"
          variant="flat"
          @click="open = false"
        />
      </template>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
  const open = ref(false)
</script>
