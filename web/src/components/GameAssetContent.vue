<template>
  <v-img
    v-if="!ficsmas && !unknown"
    :alt="subject"
    aspect-ratio="1/1"
    :max-height="heightPx"
    :max-width="widthPx"
    :min-height="heightPx"
    :min-width="widthPx"
    :src="imgUrl"
  />
  <v-icon v-if="ficsmas" icon="fas fa-snowflake" :style="{ width: widthPx + 'px', height: heightPx + 'px' }" />
  <v-icon v-if="unknown" icon="fas fa-question" :style="{ width: widthPx + 'px', height: heightPx + 'px' }" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameDataStore } from '@/stores/game-data-store'

// Props
const props = defineProps<{
  subject: string
  height?: string | number | undefined
  width?: string | number | undefined
  type: 'building' | 'item' | 'item_id' | 'vehicle'
}>()

// State
const ficsmas = ref(false)
const unknown = ref(false)
const gameData = useGameDataStore().getGameData()

if (!gameData) {
  throw new Error('No game data provided to GameAssetContent!')
}

// Computed
const widthPx = computed(() => {
  return parseInt(
    typeof props.width === 'number' ? props.width.toString() : props.width ?? '32',
    10
  )
})

const heightPx = computed(() => {
  return parseInt(
    typeof props.height === 'number' ? props.height.toString() : props.height ?? '32',
    10
  )
})

const imgSize = computed(() => widthPx.value > 64 || heightPx.value > 64 ? 'big' : 'small')
const imgUrl = computed(() => getIcon(props.subject, props.type, imgSize.value))

// Methods
const sluggify = (subject: string): string => {
  // Converts CamelCase to kebab-case without adding dash at the beginning
  return subject.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/\s+/g, '-').toLowerCase()
}

const getIcon = (
  subject: string | null,
  type: 'building' | 'item' | 'item_id' | 'vehicle',
  size: 'small' | 'big' = 'small'
): string => {
  if (!subject) {
    console.error('No subject provided to getIcon!')
    return ''
  }
  if (type === 'building') {
    return getImageUrl(subject, 'building', size)
  } else if (type === 'item_id') {
    return getImageUrl(subject, 'item', size)
  } else if (type === 'vehicle') {
    return getImageUrl(subject, 'vehicle', size)
  } else {
    const partItem = gameData.items.parts[subject]
    const rawItem = gameData.items.rawResources[subject]

    // Freight cars are not in the items list
    if (!partItem && !rawItem && subject !== 'freight-car') {
      unknown.value = true
      return ''
    }

    // If a FICSMAS item, we don't have images for it so mark it as unknown
    if (partItem?.isFicsmas) {
      ficsmas.value = true
      return ''
    }

    const item = partItem?.name || rawItem?.name || subject

    return getImageUrl(sluggify(item), 'item', size)
  }
}

const getImageUrl = (
  name: string,
  type: 'building' | 'item' | 'vehicle',
  size: 'small' | 'big' = 'big'
): string => {
  const pxSize = size === 'small' ? 64 : 256
  return `/assets/game/${type}/${name}_${pxSize}.png`
}
</script>
