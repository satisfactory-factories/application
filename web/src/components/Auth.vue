<template>
  <app-dialog
    v-model="showSessionExpiredDialog"
    card-class="border-md"
    icon="fas fa-user-clock"
    max-width="600"
    title="Session Expired!"
  >
    <p class="mb-4">Your session has expired, Pioneer. Please log in again!</p>
    <p>If this keeps happening repeatedly or much sooner than expected (30 days), please report it on <a href="https://discord.gg/vcFsjcWAFv" target="_blank">Discord</a>!</p>
    <template #actions>
      <v-btn color="primary" variant="elevated" @click="closeSessionExpiredAlert">Ok</v-btn>
    </template>
  </app-dialog>
  <v-btn :color="buttonColor" variant="flat">
    <div v-if="loggedInUser">
      <i class="fas fa-user mr-2" />
      {{ loggedInUser }}
    </div>
    <span v-else>
      <i class="fas fa-sign-in mr-2" />
      Sign In, Pioneer!
    </span>
    <v-overlay
      v-model="trayOpen"
      activator="parent"
      location="bottom end"
      location-strategy="connected"
      max-width="400"
      origin="auto"
      :scrim="false"
      transition="slide-y-transition"
    >
      <v-card class="border-md mt-1">
        <v-card-text v-if="!loggedInUser">
          <auth-form ref="authForm" :error="errorMessage" />
        </v-card-text>

        <v-card-text v-if="loggedInUser" class="text-left text-body-1">
          <account-panel :open="trayOpen" />
        </v-card-text>
      </v-card>
    </v-overlay>
  </v-btn>
</template>

<script setup lang="ts">
  import { ref, useTemplateRef } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useAuthStore } from '@/stores/auth-store'
  import AccountPanel from '@/components/sync/AccountPanel.vue'
  import AuthForm from '@/components/sync/AuthForm.vue'
  import eventBus from '@/utils/eventBus'
  import { usePreferencesStore } from '@/stores/preferences-store'
  import { useRoomsStore } from '@/stores/rooms-store'
  import { BackendOutageError } from '@/errors/BackendOutageError'
  import { InvalidTokenError } from '@/errors/InvalidTokenError'

  defineProps<{
    buttonColor?: string
  }>()

  const authStore = useAuthStore()
  const roomsStore = useRoomsStore()
  const preferencesStore = usePreferencesStore()

  const trayOpen = ref(false)
  const errorMessage = ref('')
  const authForm = useTemplateRef<InstanceType<typeof AuthForm>>('authForm')
  // The store owns the session now, so the button follows it without local copies.
  const { loggedInUser } = storeToRefs(authStore)

  const showSessionExpiredDialog = ref(false)

  // If the user closes the session expired dialog by clicking outside of it, still open the login form
  watch(showSessionExpiredDialog, newVal => {
    if (newVal === false) {
      closeSessionExpiredAlert()
    }
  })

  // The one place a token gets validated on load; nothing else does it implicitly.
  onMounted(async () => {
    eventBus.on('sessionExpired', handleSessionExpiredEvent)

    if (!authStore.getToken()) {
      return
    }

    try {
      await authStore.validateToken()
      // The session is known good: connect the socket and pull the tab list, which
      // is what decides which tabs are rooms and what adoption offers.
      await roomsStore.begin()
      await preferencesStore.begin()
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        // The store already emitted sessionExpired, which opens the dialog.
        return
      }
      if (error instanceof BackendOutageError) {
        errorMessage.value = 'The backend is currently offline. Please report this on Discord!'
        return
      }
      errorMessage.value = 'An unexpected error occurred validating your token. Please report this on Discord!'
    }
  })

  const closeSessionExpiredAlert = () => {
    showSessionExpiredDialog.value = false
    trayOpen.value = true
    // The tray only renders the form once it is open, so the reset waits for it.
    nextTick(() => authForm.value?.showLoginForm())
  }

  const sessionHasExpired = () => {
    authStore.logout()
    showSessionExpiredDialog.value = true
    trayOpen.value = false
  }

  const handleSessionExpiredEvent = () => {
    console.log('Auth: Received sessionExpired event')
    sessionHasExpired()
  }

  onBeforeUnmount(() => {
    eventBus.off('sessionExpired', handleSessionExpiredEvent)
  })
</script>
