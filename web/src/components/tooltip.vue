<template>
  <!-- Both wrappers are inline-flex: an inline box is baseline-aligned and taller than the
       icon inside it, so the slot content never lines up with controls sitting beside it.
       Every usage wraps a single icon, image, chip or button — never flowing text. -->
  <span
    class="d-inline-flex align-center"
    :class="classes"
    @focusin="show"
    @focusout="hide"
    @mouseenter="show"
    @mouseleave="hide"
  >
    <span ref="activator" class="d-inline-flex align-center">
      <slot />
    </span>
    <!-- Mounted on the first hover rather than up front. A factory carries around a hundred of
         these, and each v-tooltip is a full overlay component, which made opening a factory
         noticeably slower for hints that are mostly never read. -->
    <v-tooltip
      v-if="armed"
      v-model="open"
      :disabled="disabled"
      :open-on-focus="false"
      :open-on-hover="false"
      :target="activator ?? undefined"
    >
      <!-- Escaped: `text` is built from plan data (part ids, factory names), which a share
           link controls. See safeHtml. -->
      <span v-html="safeHtml(text)" />
    </v-tooltip>
  </span>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { safeHtml } from '@/utils/safeHtml'

  const props = defineProps<{
    text: string
    classes?: string
    // Wrapping is often conditional (a hint that only applies while a control is locked),
    // so the tooltip can be silenced without restructuring the markup around it.
    disabled?: boolean
  }>()

  const activator = ref<HTMLElement | null>(null)
  const armed = ref(false)
  const open = ref(false)

  const show = () => {
    if (props.disabled) return
    armed.value = true
    open.value = true
  }

  const hide = () => {
    open.value = false
  }
</script>
