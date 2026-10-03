<template>
  <!-- Deliberately blocking, and deliberately without a corner close: until the page is reloaded
       nothing this tab does will be saved, so there is no state worth returning to behind it. -->
  <app-dialog
    v-model="isOpen"
    :closable="false"
    icon="fas fa-arrow-up"
    max-width="600"
    persistent
    title="An update has been released"
  >
    <p class="mb-4">
      This page is running an older version of the planner
      (<strong>{{ currentVersion }}</strong>) than the server now accepts
      (<strong>{{ minimumVersion }}</strong>). <strong>Nothing will be saved to your
        account</strong> until you reload.
    </p>
    <p class="mb-0 text-medium-emphasis">
      Your plan is safe: it is stored in this browser and reloading will not lose it. This
      is not an outage, and there is nothing to report.
    </p>
    <template #actions>
      <v-btn color="primary" variant="flat" @click="reload">
        <i class="fas fa-arrow-up mr-2" />Reload the page
      </v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref } from 'vue'
  import eventBus from '@/utils/eventBus'
  import { config } from '@/config/config'

  const isOpen = ref(false)
  const minimumVersion = ref('unknown')
  const currentVersion = config.appVersion

  // Deliberately does nothing to local state. The user's plan is in localStorage and reloading
  // is the entire fix; clearing anything here would turn a stale tab into lost work.
  const reload = () => {
    window.location.reload()
  }

  // Two clients for one fact. This one reads the `X-Planner-Client-Outdated` header off a raw
  // fetch; VersionPrompt reads the 426 body and the socket's 4426 close, which is the path
  // every call through `api/client.ts` takes. Where both could fire, the banner wins placement:
  // it is the one the sync engine's own state drives, and a modal over it would hide it.
  const gated = ref(false)

  const announce = ({ minimumVersion: minimum }: { minimumVersion: string }) => {
    if (gated.value) return
    minimumVersion.value = minimum
    isOpen.value = true
  }

  const standDown = () => {
    gated.value = true
    isOpen.value = false
  }

  eventBus.on('clientOutdated', announce)
  eventBus.on('versionMismatch', standDown)

  onBeforeUnmount(() => {
    eventBus.off('clientOutdated', announce)
    eventBus.off('versionMismatch', standDown)
  })
</script>
