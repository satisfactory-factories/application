<!-- One tooltip for every game image in the application.

     Mounted once, at the app shell. A plan renders hundreds of item and building images, and
     giving each one its own <v-tooltip> would mount hundreds of overlay components to show at
     most one at a time. Instead every image marks itself with `data-asset-tooltip` and a single
     delegated mouseover listener points this one tooltip at whatever is under the cursor, so the
     cost is one component and one listener no matter how big the plan gets. -->
<template>
  <v-tooltip
    v-if="target"
    :key="nonce"
    location="top"
    :model-value="true"
    :target="target"
    :text="text"
  />
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue'

  const target = ref<HTMLElement | null>(null)
  const text = ref('')
  // Remounts the overlay per target: reusing it makes the tooltip slide across the screen from
  // the previous image rather than appearing over the new one.
  const nonce = ref(0)

  const clear = () => {
    target.value = null
  }

  const onPointerOver = (event: Event) => {
    const found = (event.target as Element | null)?.closest?.('[data-asset-tooltip]')
    const el = found instanceof HTMLElement ? found : null

    if (el === target.value) return
    if (!el) return clear()

    text.value = el.dataset.assetTooltip ?? ''
    target.value = el
    nonce.value++
  }

  onMounted(() => {
    document.addEventListener('mouseover', onPointerOver, { passive: true })
    // The pointer leaving the window fires no further mouseover, so the tooltip would hang.
    document.addEventListener('mouseleave', clear, { passive: true })
    window.addEventListener('blur', clear, { passive: true })
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mouseover', onPointerOver)
    document.removeEventListener('mouseleave', clear)
    window.removeEventListener('blur', clear)
  })
</script>
