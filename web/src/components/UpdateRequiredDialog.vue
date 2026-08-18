<template>
  <v-dialog v-model="isOpen" max-width="600" persistent>
    <v-card>
      <v-card-title class="text-h6 py-4">
        <i class="fas fa-sync mr-2" />
        <span>An update has been released</span>
      </v-card-title>
      <v-divider />
      <v-card-text>
        <p class="mb-4">
          This page is running an older version of the planner
          (<strong>{{ currentVersion }}</strong>) than the server now accepts
          (<strong>{{ minimumVersion }}</strong>). <strong>Nothing will be saved to your
            account</strong> until you reload.
        </p>
        <p class="mb-0 text-body-2 text-medium-emphasis">
          Your plan is safe: it is stored in this browser and reloading will not lose it. This
          is not an outage, and there is nothing to report.
        </p>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="reload">
          <i class="fas fa-sync mr-2" />Reload the page
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
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

  eventBus.on('clientOutdated', ({ minimumVersion: minimum }) => {
    minimumVersion.value = minimum
    isOpen.value = true
  })
</script>
