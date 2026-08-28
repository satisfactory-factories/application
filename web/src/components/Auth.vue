<template>
  <v-dialog
    v-model="showSessionExpiredDialog"
    max-width="600"
  >
    <v-card class="border-md">
      <v-card-title class="text-h5">Session Expired!</v-card-title>
      <v-card-text>
        <p class="mb-4">Your session has expired, Pioneer. Please log in again!</p>
        <p>If this keeps happening repeatedly or much sooner than expected (30 days), please report it on <a href="https://discord.gg/vcFsjcWAFv" target="_blank">Discord</a>!</p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" variant="elevated" @click="closeSessionExpiredAlert">Ok</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
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
          <div class="text-center mb-4">
            <v-btn-group>
              <v-btn
                color="primary"
                :variant="showLogin === true ? 'flat' : 'tonal'"
                @click="showLoginForm"
              >
                <i class="fas fa-sign-in mr-2" />Sign In
              </v-btn>
              <v-btn
                color="green"
                :variant="showRegister ? 'flat' : 'tonal'"
                @click="showRegisterForm"
              >
                <i class="fas fa-pencil mr-2" />Register
              </v-btn>
            </v-btn-group>
          </div>
          <p class="text-body-2 text-left mb-4">
            Register or log in to save your Plan(s). Whenever you make changes it will be automatically saved.
          </p>
          <v-divider />
          <v-form v-if="showLogin" @submit.prevent="handleLoginForm">
            <v-text-field
              v-model="username"
              label="Username"
              required
            />
            <v-text-field
              v-model="password"
              label="Password"
              required
              type="password"
            />
            <v-btn color="primary" type="submit" variant="flat">Log in</v-btn>
          </v-form>
          <v-form v-if="showRegister" @submit.prevent="handleRegisterForm">
            <p class="text-body-2 text-left mb-4 mt-2 text-amber">Please do not use an email address as a username. we do not wish to store any PII (Personally Identifiable Information) - since this is a hobby project data security is not a paramount priority.</p>
            <v-text-field
              v-model="username"
              label="Username"
              required
            />
            <v-text-field
              v-model="password"
              label="Password"
              required
              type="password"
            />
            <p class="text-left mb-2"><b>NOTE:</b> There is currently no password reset system implemented. If you lose your login details, you'll have to create a new account!</p>
            <v-btn color="green" type="submit" variant="flat">Register</v-btn>
          </v-form>
          <div v-if="errorMessage" class="mt-2">
            <p class="text-red font-weight-bold">{{ errorMessage }}</p>
            <p v-if="errorMessage.toLowerCase().includes('discord')">
              <a href="https://discord.gg/vcFsjcWAFv" target="_blank">Join our Discord →</a>
            </p>
          </div>
        </v-card-text>

        <v-card-text v-if="loggedInUser" class="text-left text-body-1">
          <v-btn
            class="mr-2"
            color="primary"
            @click="handleLogout"
          >
            <i class="fas fa-sign-out mr-2" />Logout
          </v-btn>
          <v-btn
            v-if="isDebugMode"
            class="mr-2"
            color="secondary"
            @click="mangleToken"
          >
            <i class="fas fa-bug mr-2" />Mangle token
          </v-btn>
          <p class="mt-4">
            You are signed in. Synced plans save to your account as you edit them and follow you to every device.
          </p>
          <sync />
        </v-card-text>
      </v-card>
    </v-overlay>
  </v-btn>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useAuthStore } from '@/stores/auth-store'
  import Sync from '@/components/Sync.vue'
  import eventBus from '@/utils/eventBus'
  import { useAppStore } from '@/stores/app-store'
  import { BackendOutageError } from '@/errors/BackendOutageError'
  import { InvalidTokenError } from '@/errors/InvalidTokenError'

  defineProps<{
    buttonColor?: string
  }>()

  const authStore = useAuthStore()
  const { isDebugMode } = useAppStore()

  const trayOpen = ref(false)
  const username = ref('')
  const password = ref('')
  const showLogin = ref(true)
  const showRegister = ref(false)
  const errorMessage = ref('')
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

  const showLoginForm = () => {
    showLogin.value = true
    showRegister.value = false
    errorMessage.value = ''
  }

  const showRegisterForm = () => {
    showLogin.value = false
    showRegister.value = true
    errorMessage.value = ''
  }

  const closeSessionExpiredAlert = () => {
    showSessionExpiredDialog.value = false
    trayOpen.value = true
    showLoginForm()
  }

  const sessionHasExpired = () => {
    authStore.logout()
    showSessionExpiredDialog.value = true
    trayOpen.value = false
    showLogin.value = true
  }

  const handleLoginForm = async () => {
    errorMessage.value = ''
    if (username.value === '' || password.value === '') {
      errorMessage.value = 'Please fill in both fields.'
      return
    }

    const result = await authStore.login(username.value, password.value)
    if (result !== true) {
      errorMessage.value = `Login failed: ${result}`
    }
  }

  const handleRegisterForm = async () => {
    errorMessage.value = ''
    if (username.value === '' || password.value === '') {
      errorMessage.value = 'Please fill in both fields.'
      return
    }

    // Also logs them in
    const result = await authStore.register(username.value, password.value)
    if (result !== true) {
      errorMessage.value = `Registration failed: ${result}`
    }
  }

  const handleLogout = () => {
    authStore.logout()
  }

  const handleSessionExpiredEvent = () => {
    console.log('Auth: Received sessionExpired event')
    sessionHasExpired()
  }

  // Debug feature to mangle the users' token and attempt a validation, which should trigger the session expired event
  const mangleToken = () => {
    const token = authStore.getToken()
    if (!token) return

    authStore.setToken(`mangled${token}`)
    console.log('Auth: Mangled token')
    // Disable this if you want to test without revalidation
    authStore.validateToken().catch(() => {})
  }

</script>
