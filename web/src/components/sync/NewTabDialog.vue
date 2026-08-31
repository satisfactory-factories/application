<template>
  <app-dialog
    v-model="open"
    card-class="border-md"
    data-testid="new-tab-dialog"
    :icon="signingIn ? 'fas fa-sign-in' : 'fas fa-plus'"
    :max-width="signingIn ? 520 : 720"
    :title="signingIn ? 'Sign in for a synced tab' : 'New tab'"
  >
    <div v-if="!signingIn">
      <div class="d-flex flex-column flex-md-row ga-4">
        <v-card
          class="choice flex-1-1 pa-4"
          data-testid="choose-local-tab"
          :disabled="busy"
          variant="tonal"
          @click="chooseLocal"
        >
          <div class="text-h6 mb-2">
            <span class="mr-2"><i class="fas fa-desktop" /></span>Local tab
          </div>
          <p class="text-body-2">
            Lives in this browser only. No account needed. This is the classic planner tab.
          </p>
        </v-card>

        <v-card
          class="choice flex-1-1 pa-4"
          data-testid="choose-synced-tab"
          :disabled="busy"
          variant="tonal"
          @click="chooseSynced"
        >
          <div class="text-h6 mb-2">
            <span class="mr-2"><i class="fas fa-user" /></span>Synced tab
          </div>
          <p class="text-body-2">
            Saved to your account and kept in step across every device you sign in on.
            Share it later to plan together with friends in real time.
          </p>
        </v-card>
      </div>

      <p v-if="!isLoggedIn" class="mt-4 text-body-2 text-amber" data-testid="synced-needs-account">
        A synced tab needs an account. Pick it and you can sign in or register right here.
        Local tabs stay exactly as they are.
      </p>
      <p v-if="error" class="mt-4 text-body-2 text-red" data-testid="new-tab-error">{{ error }}</p>
    </div>

    <auth-form
      v-else
      intro="Sign in or register and your synced tab is made straight afterwards."
      @authenticated="onAuthenticated"
    />

    <template #actions>
      <v-btn v-if="signingIn" data-testid="new-tab-back" variant="text" @click="signingIn = false">
        Back
      </v-btn>
      <v-btn :disabled="busy" variant="text" @click="open = false">Cancel</v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import AuthForm from '@/components/sync/AuthForm.vue'
  import { useAppStore } from '@/stores/app-store'
  import { useAuthStore } from '@/stores/auth-store'
  import { useRoomsStore } from '@/stores/rooms-store'

  const open = defineModel<boolean>({ default: false })

  const appStore = useAppStore()
  const roomsStore = useRoomsStore()
  const { isLoggedIn } = storeToRefs(useAuthStore())

  const busy = ref(false)
  const error = ref('')
  const signingIn = ref(false)

  const chooseLocal = () => {
    appStore.addTab()
    open.value = false
  }

  const chooseSynced = async () => {
    if (!isLoggedIn.value) {
      signingIn.value = true
      return
    }

    busy.value = true
    error.value = ''

    const result = await roomsStore.createSyncedTab('New Tab')
    busy.value = false
    if (result !== true) {
      error.value = result
      return
    }
    open.value = false
  }

  /**
   * Signing in kicks off the room list fetch, and a tab created while that is in
   * flight comes back missing from the list and is converted straight back to local.
   * So the choice the user already made resumes once the session has landed.
   */
  const onAuthenticated = async () => {
    signingIn.value = false
    busy.value = true
    await roomsStore.whenSessionReady()
    busy.value = false
    await chooseSynced()
  }

  watch(open, value => {
    if (!value) return
    error.value = ''
    signingIn.value = false
  })
</script>

<style lang="scss" scoped>
.choice {
  cursor: pointer;
}
</style>
