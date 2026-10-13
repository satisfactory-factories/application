<template>
  <div class="hex-field">
    <span class="hash">#</span>
    <input
      aria-label="Hex colour code"
      class="hex-input"
      :class="{ invalid: !valid }"
      maxlength="7"
      spellcheck="false"
      type="text"
      :value="text"
      @blur="commit(true)"
      @input="onInput"
      @keydown.enter.prevent="commit(false)"
    >
    <button
      :aria-label="copied ? 'Copied' : 'Copy hex code'"
      class="copy-button"
      :data-hover-tooltip="copied ? 'Copied' : 'Copy hex code'"
      type="button"
      @click="copy"
    >
      <!-- FontAwesome swaps the <i> for an <svg> Vue no longer owns, so the key sits on a wrapper. -->
      <span :key="copied ? 'check' : 'copy'"><i :class="copied ? 'fas fa-check' : 'fas fa-copy'" /></span>
    </button>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue'

  /**
   * The current colour as an editable hex code, with a copy button. Shows the code without its
   * hash (the hash sits outside the box) and only hands a colour back once it is a whole one: Enter
   * or leaving the box applies it, and anything that isn't a hex code puts the current one back.
   */
  const props = defineProps<{ modelValue: string }>()
  const emit = defineEmits<{ (event: 'update:modelValue', color: string): void }>()

  const strip = (color: string) => color.replace(/^#/, '').slice(0, 6).toUpperCase()

  const text = ref(strip(props.modelValue))
  watch(() => props.modelValue, color => {
    text.value = strip(color)
  })

  // Six digits, or the three-digit shorthand, with or without the hash someone pasted in.
  const normalise = (value: string): string | null => {
    const digits = value.trim().replace(/^#/, '')
    if (/^[\da-f]{6}$/i.test(digits)) return `#${digits.toLowerCase()}`
    if (/^[\da-f]{3}$/i.test(digits)) return `#${[...digits].map(d => d + d).join('').toLowerCase()}`
    return null
  }

  const valid = computed(() => normalise(text.value) !== null)

  const onInput = (event: Event) => {
    text.value = (event.target as HTMLInputElement).value
  }

  const commit = (fromBlur: boolean) => {
    const hex = normalise(text.value)
    if (!hex) {
      if (fromBlur) text.value = strip(props.modelValue)
      return
    }
    text.value = strip(hex)
    if (hex !== props.modelValue.slice(0, 7).toLowerCase()) emit('update:modelValue', hex)
  }

  const copied = ref(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`#${strip(props.modelValue)}`)
    } catch {
      return
    }
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 1500)
  }

  onBeforeUnmount(() => clearTimeout(copiedTimer))
</script>

<style lang="scss" scoped>
.hex-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85rem;
}

.hash {
  color: #9e9e9e;
}

.hex-input {
  width: 6.5ch;
  color: inherit;
  font: inherit;
  text-transform: uppercase;
  outline: none;

  &.invalid {
    color: rgb(var(--v-theme-error));
  }
}

.copy-button {
  padding: 2px 4px;
  color: #bdbdbd;
  cursor: pointer;

  &:hover {
    color: #fff;
  }
}
</style>
