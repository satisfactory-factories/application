<template>
  <v-dialog v-model="showSplash" max-width="1000" scrollable @click="closeSplash">
    <v-card>
      <v-card-title class="text-h4 text-center pb-0">Alpha v0.4 released!</v-card-title>
      <v-card-text class="text-center">
        <p class="mb-4">Check out what's new in the video below!</p>
        <v-responsive :aspect-ratio="16 / 9" class="pb-4">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            frameborder="0"
            height="100%"
            referrerpolicy="strict-origin-when-cross-origin"
            src="https://www.youtube.com/embed/xiE7AwfzOpc?si=O0WvISqiPUPKFpCT"
            title="YouTube video player"
            width="100%"
          />
        </v-responsive>
        <p>You can see a full list of changes on the <v-btn color="primary" href="/changelog">Change Log</v-btn></p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" variant="elevated" @click="closeSplash">
          <i class="fas fa-check" /><span class="ml-2">Got it!</span>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  const key = 'seenV4Splash'
  const seenSplash = localStorage.getItem(key)
  const seenIntro = localStorage.getItem('dismissed-introduction') ?? 'false'
  // If the user has not seen the intro splash, don't show them this as there would be two splashes.

  const showSplash = ref<boolean>(seenSplash !== 'true' && seenIntro === 'true')

  // In case the user closes the dialog without clicking on the button
  watch(() => showSplash.value, value => {
    if (!value) {
      closeSplash()
    }
  })

  const closeSplash = () => {
    showSplash.value = false
    localStorage.setItem(key, 'true')
  }

</script>
