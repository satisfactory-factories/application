<template>
  <v-tooltip location="top">
    <template #activator="{ props: tooltipProps }">
      <v-btn
        color="blue rounded"
        data-testid="share-button"
        icon="fas fa-share-alt"
        size="small"
        variant="flat"
        v-bind="tooltipProps"
        @click="dialogOpen = true"
      />
    </template>
    <span>Share this tab: a snapshot link, or an invite to plan together</span>
  </v-tooltip>
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
