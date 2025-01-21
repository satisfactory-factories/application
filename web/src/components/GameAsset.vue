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
    :transition="transition"
  />
  <v-icon v-if="ficsmas" icon="fas fa-snowflake" :style="{ width: widthPx + 'px', height: heightPx + 'px' }" />
  <v-icon v-if="unknown" icon="fas fa-question" :style="{ width: widthPx + 'px', height: heightPx + 'px' }" />
</template>

<script setup lang="ts">
  import { defineProps } from 'vue'
  import { useGameDataStore } from '@/stores/game-data-store'

  useGameDataStore()
  const gameData = useGameDataStore().getGameData()
  const ficsmas = ref(false)
  const unknown = ref(false)

  if (!gameData) {
    throw new Error('No game data provided to GameAsset!')
  }

  const props = defineProps<{
    subject: string
    height?: string | number | undefined
    width?: string | number | undefined
    type: 'building' | 'item',
    transition?: string | undefined
  }>()

  const sluggify = (subject: string): string => {
    // Converts CamelCase to kebab-case without adding dash at the beginning
    return subject.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/\s+/g, '-').toLowerCase()
  }

  const getIcon = (
    subject: string | null,
    type: 'building' | 'item',
    size: 'small' | 'big' = 'small'
  ): string => {
    if (!subject) {
      console.error('No subject provided to getIcon!')
      return ''
    }
    if (type === 'building') {
      return getImageUrl(subject, 'building', size)
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
    type: 'building' | 'item',
    size: 'small' | 'big' = 'big'
  ): string => {
    const pxSize = size === 'small' ? 64 : 256
    return `/assets/game/${type}/${name}_${pxSize}.png`
  }

  const widthPx = parseInt(
    typeof props.width === 'number' ? props.width.toString() : props.width ?? '32',
    10
  )
  const heightPx = parseInt(
    typeof props.height === 'number' ? props.height.toString() : props.height ?? '32',
    10
  )
  const imgSize = widthPx > 64 || heightPx > 64 ? 'big' : 'small'
  const imgUrl = getIcon(props.subject, props.type, imgSize)
</script>
