<template>
  <app-dialog
    v-model="open"
    body-max-height="60vh"
    card-class="border-md"
    data-testid="new-tab-dialog"
    :icon="signingIn ? 'fas fa-sign-in' : 'fas fa-plus'"
    :max-width="signingIn ? 520 : 720"
    scrollable
    :title="signingIn ? 'Sign in for a synced tab' : 'New tab'"
  >
    <div v-if="!signingIn">
      <div class="d-flex flex-column flex-md-row ga-4">
        <v-card
          class="choice flex-1-1 pa-4"
          data-testid="choose-local-tab"
          :disabled="busy"
          role="button"
          :tabindex="busy ? -1 : 0"
          variant="tonal"
          @click="chooseLocal"
          @keydown.enter.prevent="chooseLocal"
          @keydown.space.prevent="chooseLocal"
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
          role="button"
          :tabindex="busy ? -1 : 0"
          variant="tonal"
          @click="chooseSynced"
          @keydown.enter.prevent="chooseSynced"
          @keydown.space.prevent="chooseSynced"
        >
          <div class="text-h6 mb-2">
            <span class="mr-2"><i class="fas fa-cloud" /></span>Synced tab
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

      <!-- Reopening a plan you hid is a "new tab" move as far as the user is concerned, so
           it belongs on this button rather than three clicks away in the account panel. The
           rows are the panel's own, Show button and all. -->
      <div v-if="unopened.length > 0" class="mt-4" data-testid="open-existing-plans">
        <v-divider class="mb-3" />
        <p class="mb-2 text-body-2">
          Or open a plan already on your account. It is closed in this browser, not gone.
        </p>
        <cloud-plan-row
          v-for="plan in unopened"
          :key="plan.roomId"
          data-testid="unopened-plan"
          :loading="openingId === plan.roomId"
          :now="now"
          :open="false"
          :room="plan"
          @toggle="openExisting"
        />
      </div>
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
  import { computed, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import AuthForm from '@/components/sync/AuthForm.vue'
  import CloudPlanRow from '@/components/sync/CloudPlanRow.vue'
  import { useAppStore } from '@/stores/app-store'
  import { useAuthStore } from '@/stores/auth-store'
  import { useRoomsStore } from '@/stores/rooms-store'

  const open = defineModel<boolean>({ default: false })

  const appStore = useAppStore()
  const roomsStore = useRoomsStore()
  const { entries } = storeToRefs(roomsStore)
  const { isLoggedIn } = storeToRefs(useAuthStore())

  const busy = ref(false)
  const error = ref('')
  const signingIn = ref(false)

  /**
   * The account's plans with no tab in this browser — hidden, in other words.
   * Showing and hiding stays per-browser, so this list is the one place that
   * says what this device is missing out on. Membership order, as everywhere.
   */
  const unopened = computed(() => isLoggedIn.value
    ? Object.values(entries.value)
      .filter(plan => !appStore.getTab(plan.roomId))
      .sort((first, second) => first.order - second.order)
    : [])

  /** Read when the dialog opened, so "3m ago" is measured from then. */
  const now = ref(new Date())
  const openingId = ref('')

  const openExisting = async (roomId: string) => {
    openingId.value = roomId
    error.value = ''
    const result = await roomsStore.openPlan(roomId)
    openingId.value = ''
    if (result !== true) {
      error.value = result
      return
    }
    open.value = false
  }

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
    now.value = new Date()
    // The list is only as fresh as the last refresh, and a plan made on another
    // device since then is exactly what someone opening this dialog is after.
    if (isLoggedIn.value) void roomsStore.refresh()
  }, { immediate: true })
</script>

<style lang="scss" scoped>
.choice {
  cursor: pointer;
}

// The cards are the only controls in the dialog, so a keyboard user has to be able
// to see which one they are on.
.choice:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
</style>
