<!-- The sign-in and register pair, on its own so more than one place can offer it: the account
     tray, and the new-tab chooser when someone picks a synced tab without an account. -->
<template>
  <div data-testid="auth-form">
    <div class="text-center mb-4">
      <v-btn-group>
        <v-btn
          color="primary"
          data-testid="show-login"
          :variant="showLogin ? 'flat' : 'tonal'"
          @click="showLoginForm"
        >
          <i class="fas fa-sign-in mr-2" />Sign In
        </v-btn>
        <v-btn
          color="green"
          data-testid="show-register"
          :variant="showRegister ? 'flat' : 'tonal'"
          @click="showRegisterForm"
        >
          <i class="fas fa-pencil mr-2" />Register
        </v-btn>
      </v-btn-group>
    </div>
    <!-- The tray still opens when the server is down, because "the button does nothing" is worse
         than being told why. Nothing here can succeed though, so the fields go inert with it. -->
    <v-alert
      v-if="health.unhealthy"
      class="mb-4 text-left"
      data-testid="auth-backend-outage"
      density="compact"
      type="error"
      variant="tonal"
    >
      <div class="text-body-2">
        <b>Our backend servers are not responding.</b> Signing in and registering are unavailable
        until they are back.
      </div>
      <div class="text-caption mt-1">
        Please report it on <a :href="DISCORD_INVITE" rel="noopener" target="_blank">Discord</a> and
        try again later. Your plans are safe: everything in your tabs is kept in this browser.
      </div>
    </v-alert>
    <p class="text-body-2 text-left mb-4">{{ intro }}</p>
    <v-divider />
    <v-form v-if="showLogin" @submit.prevent="handleLoginForm">
      <v-text-field
        v-model="username"
        :disabled="health.unhealthy"
        label="Username"
        required
      />
      <v-text-field
        v-model="password"
        :disabled="health.unhealthy"
        label="Password"
        required
        type="password"
      />
      <v-btn
        color="primary"
        :disabled="health.unhealthy"
        :loading="busy"
        type="submit"
        variant="flat"
      >Log in</v-btn>
    </v-form>
    <v-form v-if="showRegister" @submit.prevent="handleRegisterForm">
      <p class="text-body-2 text-left mb-4 mt-2 text-amber">Please do not use an email address as a username. we do not wish to store any PII (Personally Identifiable Information) - since this is a hobby project data security is not a paramount priority.</p>
      <v-text-field
        v-model="username"
        :disabled="health.unhealthy"
        label="Username"
        required
      />
      <v-text-field
        v-model="password"
        :disabled="health.unhealthy"
        label="Password"
        required
        type="password"
      />
      <p class="text-left mb-2"><b>NOTE:</b> There is currently no password reset system implemented. If you lose your login details, you'll have to create a new account!</p>
      <v-btn
        color="green"
        :disabled="health.unhealthy"
        :loading="busy"
        type="submit"
        variant="flat"
      >Register</v-btn>
    </v-form>
    <div v-if="message" class="mt-2">
      <p class="text-red font-weight-bold" data-testid="auth-error">{{ message }}</p>
      <p v-if="message.toLowerCase().includes('discord')">
        <a href="https://discord.gg/vcFsjcWAFv" target="_blank">Join our Discord →</a>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useAuthStore } from '@/stores/auth-store'
  import { useBackendHealthStore } from '@/stores/backend-health-store'

  /** The same invite the health banner and the introduction hand out. */
  const DISCORD_INVITE = 'https://discord.gg/vcFsjcWAFv'

  const props = withDefaults(defineProps<{
    /** The line above the fields, so each host can say why it is asking. */
    intro?: string
    /** A failure the host hit outside the form, shown in the same place as the form's own. */
    error?: string
  }>(), {
    intro: 'Register or log in to save your Plan(s). Whenever you make changes it will be automatically saved.',
    error: '',
  })

  const emit = defineEmits<{ (event: 'authenticated'): void }>()

  const authStore = useAuthStore()
  const health = useBackendHealthStore()

  const username = ref('')
  const password = ref('')
  const showLogin = ref(true)
  const showRegister = ref(false)
  const busy = ref(false)
  const errorMessage = ref('')

  const message = computed(() => errorMessage.value || props.error)

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

  const handleLoginForm = async () => {
    errorMessage.value = ''
    if (username.value === '' || password.value === '') {
      errorMessage.value = 'Please fill in both fields.'
      return
    }

    busy.value = true
    const result = await authStore.login(username.value, password.value)
    busy.value = false
    if (result !== true) {
      errorMessage.value = `Login failed: ${result}`
      return
    }
    emit('authenticated')
  }

  const handleRegisterForm = async () => {
    errorMessage.value = ''
    if (username.value === '' || password.value === '') {
      errorMessage.value = 'Please fill in both fields.'
      return
    }

    busy.value = true
    // Also logs them in
    const result = await authStore.register(username.value, password.value)
    busy.value = false
    if (result !== true) {
      errorMessage.value = `Registration failed: ${result}`
      return
    }
    emit('authenticated')
  }

  defineExpose({ showLoginForm })
</script>
