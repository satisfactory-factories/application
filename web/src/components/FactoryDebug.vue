<template>
  <template v-if="isDebugMode">
    <v-btn
      v-if="isCompact"
      class="mr-2 rounded"
      color="primary"
      icon="fas fa-bug"
      ripple
      size="small"
      variant="flat"
      @click="isOpen = true"
    />
    <v-btn
      v-else
      class="mr-2"
      color="primary"
      prepend-icon="fas fa-bug"
      ripple
      variant="flat"
      @click="isOpen = true"
    >
      Show data
    </v-btn>
    <app-dialog
      v-model="isOpen"
      icon="fas fa-bug"
      max-width="1000"
      scrollable
      :title="title"
    >
      <pre>{{ subject }}</pre>
      <template #actions>
        <v-btn
          color="yellow"
          prepend-icon="fas fa-file"
          text="Replace from Clipboard"
          @click="replaceWithClipboard(subject)"
        />
        <v-btn
          color="green"
          prepend-icon="fas fa-file"
          :text="isCopied ? 'Copied!' : 'Copy data'"
          @click="clipboard(subject)"
        />
        <v-spacer />
        <v-btn
          color="primary"
          prepend-icon="fas fa-times"
          text="Close"
          @click="isOpen = false"
        />
      </template>
    </app-dialog>
  </template>
</template>
<script lang="ts" setup>
  import { useAppStore } from '@/stores/app-store'

  const props = defineProps<{
    isCompact?: boolean;
    subject: any;
    subjectType: string;
  }>()

  const { isDebugMode } = useAppStore()
  const isOpen = ref(false)
  const isCopied = ref(false)
  const title = computed(() => `${props.subjectType} debug info`)

  const clipboard = (subject: any) => {
    navigator.clipboard.writeText(JSON.stringify(subject))
    isCopied.value = true
    console.log(`Copied ${props.subjectType} data to clipboard`)
  }

  const replaceWithClipboard = (subject: any) => {
    navigator.clipboard.readText().then(text => {
      try {
        const data = JSON.parse(text)
        Object.assign(subject, data)
        console.log(`Replaced ${props.subjectType} data with clipboard data`)
      } catch (error) {
        console.error(`Failed to replace ${props.subjectType} data with clipboard data`, error)
      }
    })
  }
</script>

<style lang="scss" scoped>
// The dump is a single long line per key; let it scroll rather than stretch the dialog.
pre {
  overflow-x: auto;
}
</style>
