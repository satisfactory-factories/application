<template>
  <div class="account-panel text-left" data-testid="account-panel">
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="text-h6">
        <i class="fas fa-user mr-2" />{{ username }}
      </div>
      <v-btn size="small" variant="tonal" @click="logout">
        <i class="fas fa-sign-out mr-2" />Log out
      </v-btn>
    </div>

    <v-chip
      class="mb-3"
      :color="connection.color"
      data-testid="connection-chip"
      size="small"
      variant="flat"
    >
      <i :class="`fas ${connection.icon} mr-2`" />{{ connection.label }}
    </v-chip>

    <v-switch
      color="orange"
      data-testid="offline-switch"
      density="compact"
      hide-details
      label="Offline mode"
      :model-value="roomSync.isOffline"
      @update:model-value="toggleOffline"
    />
    <p class="text-body-2 mb-4 text-grey">
      Offline mode stops all contact with the server. Your edits are kept and sent when you
      switch it back off.
    </p>

    <v-divider class="mb-3" />

    <p class="text-body-2 font-weight-bold mb-2">Synced plans</p>
    <p v-if="rooms.length === 0" class="text-body-2 text-grey mb-3" data-testid="no-synced-plans">
      None yet. Make one from the + button on the tab bar, or sync a local plan when you sign in.
    </p>
    <div
      v-for="room in rooms"
      :key="room.roomId"
      class="align-center d-flex ga-2 mb-2"
      data-testid="synced-plan"
    >
      <span class="flex-grow-1 text-truncate">{{ room.name }}</span>
      <v-chip v-if="room.shared" color="green" size="x-small" variant="flat">Shared</v-chip>
      <v-chip v-if="room.role === 'member'" size="x-small" variant="tonal">Member</v-chip>
      <v-tooltip location="top">
        <template #activator="{ props: timeProps }">
          <span
            class="text-caption text-grey text-no-wrap"
            data-testid="plan-last-changed"
            v-bind="timeProps"
          >{{ relativeTime(room.lastActivityAt, now) }}</span>
        </template>
        <span>Last changed {{ absoluteTime(room.lastActivityAt) }}</span>
      </v-tooltip>
      <v-tooltip location="top">
        <template #activator="{ props: shareProps }">
          <v-btn
            color="blue"
            data-testid="share-plan"
            icon="fas fa-share-alt"
            size="x-small"
            variant="flat"
            v-bind="shareProps"
            @click="openShare(room.roomId)"
          />
        </template>
        <span>Sharing and invite links for this plan</span>
      </v-tooltip>
    </div>

    <v-divider class="my-3" />

    <v-btn
      block
      data-testid="recover-server-copy"
      :loading="recovering"
      variant="tonal"
      @click="recover"
    >
      <i class="fas fa-cloud-download-alt mr-2" />Recover server copy
    </v-btn>
    <p class="text-body-2 mt-1 mb-4 text-grey">
      Adds the plan the old planner saved to your account as a new synced tab. There is only
      ever one of these, and you only need to do it once.
    </p>
    <p v-if="recoverMessage" class="text-body-2 mb-4">{{ recoverMessage }}</p>

    <v-divider class="mb-3" />

    <v-btn
      block
      data-testid="toggle-change-password"
      variant="text"
      @click="passwordOpen = !passwordOpen"
    >
      <i class="fas fa-key mr-2" />Change password
    </v-btn>

    <v-form v-if="passwordOpen" class="mt-2" @submit.prevent="submitPassword">
      <v-text-field
        v-model="currentPassword"
        data-testid="current-password"
        density="compact"
        label="Current password"
        type="password"
      />
      <v-text-field
        v-model="newPassword"
        data-testid="new-password"
        density="compact"
        label="New password"
        type="password"
      />
      <v-text-field
        v-model="confirmPassword"
        data-testid="confirm-password"
        density="compact"
        label="Confirm new password"
        type="password"
      />
      <v-btn
        color="primary"
        data-testid="submit-password"
        :loading="changing"
        type="submit"
        variant="flat"
      >Change password</v-btn>
      <p v-if="passwordError" class="mt-2 text-body-2 text-red" data-testid="password-error">
        {{ passwordError }}
      </p>
      <p v-if="passwordSuccess" class="mt-2 text-body-2 text-green" data-testid="password-success">
        {{ passwordSuccess }}
      </p>
    </v-form>

    <share-dialog v-model="shareOpen" :tab-id="shareTabId" />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import ShareDialog from '@/components/sync/ShareDialog.vue'
  import { ApiError, ApiNetworkError, legacyRecover } from '@/api/client'
  import { useAuthStore } from '@/stores/auth-store'
  import { useRoomSyncStore } from '@/stores/room-sync-store'
  import { OFFLINE_MESSAGE, useRoomsStore } from '@/stores/rooms-store'
  import { absoluteTime, relativeTime } from '@/utils/relative-time'

  const props = withDefaults(defineProps<{
    /** True while the account tray is showing this panel. */
    open?: boolean
  }>(), { open: true })

  const authStore = useAuthStore()
  const roomsStore = useRoomsStore()
  const roomSync = useRoomSyncStore()

  const username = computed(() => authStore.loggedInUser)
  const rooms = computed(() =>
    Object.values(roomsStore.entries).sort((a, b) => a.order - b.order)
  )

  /**
   * Content edits move a room's last-changed stamp without bumping `roomsRevision`,
   * so nothing refetches the list on its own: a panel opened an hour into a session
   * would show the times it was first given. Reading the clock here too keeps the
   * "3 min ago" line measured from when the panel was opened.
   */
  const now = ref(new Date())

  watch(() => props.open, isOpen => {
    if (!isOpen) return
    now.value = new Date()
    void roomsStore.refresh()
  }, { immediate: true })

  // Every name below is Font Awesome 5: the vendored bundle is 5.15.4, and a v6
  // name draws the dashed missing-icon placeholder rather than failing.
  const connection = computed(() => {
    if (roomSync.connection === 'version_mismatch') {
      return { label: 'Update required', color: 'red', icon: 'fa-exclamation-triangle' }
    }
    switch (roomSync.mode) {
      // Icons must exist in the bundled FA free set: fa-wifi-slash is pro-only
      // and rendered as a dead glyph here once already.
      case 'offline': return { label: 'Offline mode', color: 'orange', icon: 'fa-plane' }
      case 'offlinePrompt': return { label: 'You appear to be offline', color: 'amber', icon: 'fa-triangle-exclamation' }
      case 'reconnecting': return { label: 'Reconnecting', color: 'amber', icon: 'fa-sync' }
      default: return roomSync.isConnected
        ? { label: 'Connected', color: 'green', icon: 'fa-wifi' }
        : { label: 'Not connected', color: 'grey', icon: 'fa-ban' }
    }
  })

  const toggleOffline = (value: boolean | null) => {
    if (value) roomSync.enterOffline()
    else roomSync.exitOffline()
  }

  // ===== Sharing =====

  const shareOpen = ref(false)
  const shareTabId = ref('')

  const openShare = (roomId: string) => {
    shareTabId.value = roomId
    shareOpen.value = true
  }

  // ===== Recover =====

  const recovering = ref(false)
  const recoverMessage = ref('')

  const RECOVER_REASONS: Record<string, string> = {
    already_imported: 'That plan has already been recovered.',
    no_legacy_data: 'There is no older saved plan on your account.',
    not_eligible: 'There is nothing to recover right now.',
  }

  const recover = async () => {
    if (roomSync.isSuppressed) {
      recoverMessage.value = OFFLINE_MESSAGE
      return
    }

    recovering.value = true
    recoverMessage.value = ''
    try {
      const result = await legacyRecover()
      if (result.imported) {
        await roomsStore.refresh()
        recoverMessage.value = 'Recovered. It is in your tab bar now.'
      } else {
        recoverMessage.value = RECOVER_REASONS[result.reason ?? ''] ?? 'Nothing to recover.'
      }
    } catch (error) {
      recoverMessage.value = error instanceof ApiNetworkError
        ? 'The server could not be reached.'
        : error instanceof ApiError ? error.message : 'Recovery failed.'
    } finally {
      recovering.value = false
    }
  }

  // ===== Change password =====

  const passwordOpen = ref(false)
  const currentPassword = ref('')
  const newPassword = ref('')
  const confirmPassword = ref('')
  const changing = ref(false)
  const passwordError = ref('')
  const passwordSuccess = ref('')

  const submitPassword = async () => {
    passwordError.value = ''
    passwordSuccess.value = ''

    if (!currentPassword.value || !newPassword.value) {
      passwordError.value = 'Fill in both password fields.'
      return
    }
    if (newPassword.value !== confirmPassword.value) {
      passwordError.value = 'The new passwords do not match.'
      return
    }
    if (roomSync.isSuppressed) {
      passwordError.value = OFFLINE_MESSAGE
      return
    }

    changing.value = true
    const result = await authStore.changePassword(currentPassword.value, newPassword.value)
    changing.value = false

    if (result !== true) {
      passwordError.value = result
      return
    }
    passwordSuccess.value = 'Password changed.'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  }

  const logout = () => {
    // Plans are never destroyed by signing out; they stop being rooms in this browser.
    // The account goes first so a tab joined anonymously can reconnect without a token.
    authStore.logout()
    roomsStore.signOut()
  }
</script>
