<template>
  <v-btn
    color="blue rounded"
    data-testid="share-button"
    icon="fas fa-share-alt"
    size="small"
    variant="flat"
    @click="dialogOpen = true"
  />
  <share-dialog v-model="dialogOpen" :tab-id="tabId" />
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import ShareDialog from '@/components/sync/ShareDialog.vue'
  import { useAppStore } from '@/stores/app-store'

  const props = defineProps<{ tab?: string }>()

  const appStore = useAppStore()
  const dialogOpen = ref(false)

  const tabId = computed(() => props.tab ?? appStore.currentFactoryTab?.id ?? '')
</script>
