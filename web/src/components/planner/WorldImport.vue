<template>
  <v-dialog v-model="showDialog" max-width="1000" scrollable>
    <v-card class="my-2">
      <v-card-title class="text-center pb-0">
        <h1 class="text-h1">Import a world! [WIP]</h1>
      </v-card-title>
      <v-card-subtitle class="text-center">
        <h6 class="text-h6">Find all your somersloops.</h6>
      </v-card-subtitle>
      <v-card-text class="text-body-1 text-left">
        <p>This will currently search through your world and find all the machines that contains somersloops.</p>
        <p>This feature is Work In Progress, and we plan to add more features such as factory importing.</p>
        <!-- https://satisfactory.wiki.gg/wiki/Save_files#Save_file_location -->
        <p>Can't find your worlds? Check out <a href="https://satisfactory.fandom.com/wiki/Save_files#Save_File_Location" target="_blank">Save File Location</a> in the Satisfactory Wiki.</p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="blue" @click="selectFile">
          <i class="fas fa-file-import" /><span class="ml-2">Select file (.sav)</span>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { defineEmits } from 'vue'
  import { parseSavFile, importWorldLoadMessages } from '@/utils/world-import/worldParser'
  import eventBus from '@/utils/eventBus'
  import { replacePlaceholders } from '@/utils/helpers'

  const props = defineProps<{
    showImportWorldPopup: boolean
  }>()

  const showDialog = ref<boolean>(false)

  onMounted(() => {
    showDialog.value = props.showImportWorldPopup
  })

  // Set up a watcher to close the dialog when the prop changes
  watch(() => props.showImportWorldPopup, value => {
    showDialog.value = value
  })

  // Set up a watcher if the dialogue is changed to closed, we emit the event by calling close()
  watch(() => showDialog.value, value => {
    if (!value) {
      console.log('Closing dialog via watch')
      close()
    }
  })

  // eslint-disable-next-line func-call-spacing
  const emit = defineEmits<{
    (event: 'closeWorldImport'): void
  }>()

  const close = () => {
    emit('closeWorldImport')
    showDialog.value = false
  }

  function selectFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.sav'
    input.onchange = readFile
    input.click()
  }

  function readFile(e: any) {
    const file = e.target.files[0]

    const name = file.name.split("_")[0] || file.name

    console.log("Selected world save:", name)
    eventBus.emit('loaderInit', { steps: Object.keys(importWorldLoadMessages).length, title: "Importing world file..." })
    eventBus.emit('loaderNextStep', { message: replacePlaceholders(importWorldLoadMessages.read_world, [name]) })

    const reader = new FileReader()
    reader.onload = (e) => {
      if (!e.target?.result) return

      const buffer = new Uint8Array(e.target.result as ArrayBuffer)
      parseSavFile(buffer)

      close()
    }
    reader.readAsArrayBuffer(file)
  }
</script>

<style lang="scss" scoped>
p {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}
</style>
