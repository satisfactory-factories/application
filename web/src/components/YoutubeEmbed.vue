<template>
  <!-- Click-to-play facade. We mount the real YouTube <iframe> only after the user
       opts in, so the page load never spins up YouTube's player. Besides the load-time
       and privacy win, this stops the embed's app hand-off on Android — the player
       trying to deep-link into the native YouTube app is what triggers Chrome's
       "wants to access other apps and services on this device" prompt. -->
  <v-responsive :aspect-ratio="16 / 9" class="youtube-embed">
    <button
      v-if="!activated"
      :aria-label="`Play video: ${title}`"
      class="youtube-embed__facade"
      type="button"
      @click="activated = true"
    >
      <img
        alt=""
        class="youtube-embed__poster"
        :src="thumbnail"
        @error="onThumbnailError"
      >
      <span class="youtube-embed__play">
        <i class="fab fa-youtube" />
      </span>
    </button>
    <iframe
      v-else
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      frameborder="0"
      height="100%"
      referrerpolicy="strict-origin-when-cross-origin"
      :src="embedSrc"
      :title="title"
      width="100%"
    />
  </v-responsive>
</template>

<script setup lang="ts">
  const props = withDefaults(defineProps<{
    videoId: string
    title?: string
    // Extra query params for the embed URL (e.g. the "si=..." share token), sans leading "?".
    params?: string
  }>(), {
    title: 'YouTube video player',
    params: '',
  })

  const activated = ref(false)

  // maxresdefault is the 1280x720 thumbnail; it 404s for some videos, so we fall
  // back to the always-present hqdefault on error (see onThumbnailError).
  const thumbnail = ref(`https://i.ytimg.com/vi/${props.videoId}/maxresdefault.jpg`)
  const onThumbnailError = () => {
    thumbnail.value = `https://i.ytimg.com/vi/${props.videoId}/hqdefault.jpg`
  }

  const embedSrc = computed(() => {
    // The user has already clicked play, so autoplay straight into the video.
    const query = [props.params, 'autoplay=1'].filter(Boolean).join('&')
    return `https://www.youtube.com/embed/${props.videoId}?${query}`
  })
</script>

<style scoped>
.youtube-embed__facade {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  cursor: pointer;
  background-color: #000;
}

.youtube-embed__poster {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.youtube-embed__play {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 68px;
  height: 48px;
  border-radius: 12px;
  background-color: rgba(0, 0, 0, 0.7);
  color: #f00;
  font-size: 2.25rem;
  transition: background-color 0.15s ease-in-out;
}

.youtube-embed__facade:hover .youtube-embed__play,
.youtube-embed__facade:focus-visible .youtube-embed__play {
  background-color: #f00;
  color: #fff;
}
</style>
