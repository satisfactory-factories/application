<template>
  <div ref="root" class="media-player">
    <video
      ref="video"
      :aria-label="label"
      loop
      muted
      playsinline
      :poster="poster"
      preload="metadata"
      @click="toggle"
      @ended="playing = false"
      @loadedmetadata="onLoaded"
      @pause="playing = false"
      @play="onPlay"
    >
      <!-- VP9 first: it carries 4:4:4 chroma, so the thin coloured borders and text in a screen
           recording survive intact. h264 has to subsample chroma 2x2 (browsers do not decode its
           4:4:4 profile), which visibly softens them, so it is the fallback rather than the
           choice. Both are tagged bt709/tv end to end; untagged, a browser guesses the matrix and
           the greys drift pale. -->
      <source :src="`${src}.webm`" type="video/webm">
      <source :src="`${src}.mp4`" type="video/mp4">
    </video>
    <!-- Deliberately not the browser's own `controls`: those carry volume, fullscreen and a
         download menu that mean nothing for a silent looping clip, have no restart button, and
         render in each browser's own chrome rather than the app's. -->
    <div class="media-bar">
      <button
        class="media-btn"
        :title="playing ? 'Pause' : 'Play'"
        type="button"
        @click="toggle"
      >
        <!-- The wrapper is what toggles, not the icon's class: FontAwesome runs in SVG mode and
             replaces the <i> with an <svg> of its own, so re-classing the <i> Vue thinks is
             there changes nothing on screen. Swapping a wrapper makes Vue mount a fresh icon. -->
        <span v-if="playing"><i class="fas fa-pause" /></span>
        <span v-else><i class="fas fa-play" /></span>
      </button>
      <button class="media-btn" title="Restart" type="button" @click="restart">
        <!-- fa-undo, not fa-rotate-left: the vendored Font Awesome is 5.15.4, so v6 icon names
             render as a dashed placeholder rather than failing loudly. -->
        <span><i class="fas fa-undo" /></span>
      </button>
      <!-- The bar is the seek control as well as the readout, so it is a real slider to a
           screen reader rather than a decorative div. -->
      <div
        ref="track"
        aria-label="Seek"
        :aria-valuemax="100"
        :aria-valuemin="0"
        :aria-valuenow="Math.round(progress)"
        class="media-track"
        role="slider"
        tabindex="0"
        @click="seek"
        @keydown.left.prevent="nudge(-5)"
        @keydown.right.prevent="nudge(5)"
      >
        <div class="media-fill" :style="{ width: `${progress}%` }" />
      </div>
      <span class="media-time">{{ clock }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
  const props = defineProps<{
    /** Path without extension; `.webm` and `.mp4` are both offered to the browser. */
    src: string
    label: string
    poster?: string
  }>()

  const video = ref<HTMLVideoElement | null>(null)
  const track = ref<HTMLElement | null>(null)
  const root = ref<HTMLElement | null>(null)
  const playing = ref(false)
  // A clip the reader paused on purpose stays paused when they scroll past and back. Only the
  // observer's automatic starts are suppressed by this; the buttons always win.
  const pausedByUser = ref(false)
  const progress = ref(0)
  const elapsed = ref(0)
  const duration = ref(0)

  // rAF rather than the `timeupdate` event, which fires as infrequently as every 250ms and
  // leaves the bar visibly stepping. The loop only runs while this clip is actually playing.
  let frame = 0

  const tick = () => {
    const el = video.value
    if (!el) return
    elapsed.value = el.currentTime
    progress.value = el.duration ? (el.currentTime / el.duration) * 100 : 0
    if (playing.value) frame = requestAnimationFrame(tick)
  }

  const onPlay = () => {
    playing.value = true
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(tick)
  }

  const onLoaded = () => {
    duration.value = video.value?.duration ?? 0
  }

  const toggle = () => {
    const el = video.value
    if (!el) return
    if (el.paused) {
      pausedByUser.value = false
      el.play()
    } else {
      pausedByUser.value = true
      el.pause()
    }
  }

  const restart = () => {
    const el = video.value
    if (!el) return
    pausedByUser.value = false
    el.currentTime = 0
    el.play()
    tick()
  }

  const seekTo = (ratio: number) => {
    const el = video.value
    if (!el || !el.duration) return
    el.currentTime = Math.min(Math.max(ratio, 0), 1) * el.duration
    tick()
  }

  const seek = (event: MouseEvent) => {
    const rect = track.value?.getBoundingClientRect()
    if (!rect?.width) return
    seekTo((event.clientX - rect.left) / rect.width)
  }

  const nudge = (percent: number) => seekTo((progress.value + percent) / 100)

  const asClock = (seconds: number) => {
    const whole = Math.max(0, Math.floor(seconds))
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
  }
  const clock = computed(() => `${asClock(elapsed.value)} / ${asClock(duration.value)}`)

  // Play only while on screen. Six clips all starting the moment the dialog opens meant the one
  // the reader eventually scrolled to was already halfway through, and it decoded five videos
  // nobody was looking at. IntersectionObserver against the viewport is enough even though the
  // dialog scrolls in its own element, because the intersection is computed against every
  // clipping ancestor, not just the root.
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    if (!root.value) return
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const el = video.value
        if (!el) continue
        if (entry.isIntersecting) {
          if (!pausedByUser.value) el.play().catch(() => { /* autoplay refused, leave it paused */ })
        } else {
          el.pause()
        }
      }
      // A third of the clip showing is enough to be worth starting, and keeps a player that is
      // only just clipped by the dialog's edge from flapping between states.
    }, { threshold: 0.34 })
    observer.observe(root.value)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    cancelAnimationFrame(frame)
  })

  watch(() => props.src, () => {
    progress.value = 0
    elapsed.value = 0
  })
</script>

<style lang="scss" scoped>
.media-player {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  overflow: hidden;

  // Vue's scoped transform anchors a descendant selector on the ancestor, so the tutorial's
  // `.verbage * { margin-bottom: 1rem }` reaches inside this component. It landed on the bar and
  // on the controls: a 1rem overhang below the bar, and buttons sitting a visible 8px above the
  // track, because a bottom margin on a flex item in an `align-items: center` row shifts the
  // item up by half of it. A blanket `.media-player *` reset only ties that rule on specificity
  // and loses on source order; going a class deeper outranks it.
  video,
  .media-bar,
  .media-bar * {
    margin: 0;
  }
}

video {
  display: block;
  width: 100%;
  cursor: pointer;
}

.media-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.35);
  line-height: 1;
}

.media-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.85);
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
}

// Font Awesome swaps the <i> for an <svg> whose default inline baseline sits the glyph low;
// centring the wrapper keeps it on the same line as the track.
.media-btn span {
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-btn :deep(svg) {
  display: block;
}

.media-track {
  flex: 1 1 auto;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.18);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 3px;
  }
}

.media-fill {
  height: 100%;
  border-radius: 3px;
  background: rgb(var(--v-theme-primary));
}

.media-time {
  flex: none;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.7);
}
</style>
