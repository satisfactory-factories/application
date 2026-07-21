<template>
  <v-responsive :aspect-ratio="16 / 9">
    <iframe
      allow="autoplay; encrypted-media; picture-in-picture"
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

  const embedSrc = computed(() => {
    const base = `https://www.youtube.com/embed/${props.videoId}`
    return props.params ? `${base}?${props.params}` : base
  })
</script>
