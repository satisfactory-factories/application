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
      <!-- Keyed span: FA replaces the <i> with an SVG once, so a :class flip
           updates a detached element and the glyph freezes on the first state. -->
      <span :key="connection.icon" class="mr-2"><i :class="`fas ${connection.icon}`" /></span>{{ connection.label }}
    </v-chip>

    <v-switch
      class="offline-switch"
      color="orange"
      data-testid="offline-switch"
      density="compact"
      hide-details
      :model-value="roomSync.isOffline"
      @update:model-value="toggleOffline"
    >
      <!-- The same fa-plane the connection chip above wears for the offline state:
           the switch that causes that state carries the icon it puts you in. -->
      <template #label>
        <span class="mr-2"><i class="fas fa-plane" /></span>Offline mode
      </template>
    </v-switch>
    <p class="text-body-2 mb-4 text-grey">
      Offline mode stops all contact with the server. Your edits are kept and sent when you
      switch it back off.
    </p>

    <v-divider class="mb-3" />

    <v-tabs
      v-model="panelTab"
      class="mb-3"
      color="primary"
      density="compact"
      grow
    >
      <v-tab data-testid="plans-tab-local" value="local">
        <span class="mr-2"><i class="fas fa-desktop" /></span>Local
      </v-tab>
      <v-tab data-testid="plans-tab-cloud" value="cloud">
        <span class="mr-2"><i class="fas fa-cloud" /></span>Cloud
      </v-tab>
    </v-tabs>

    <div v-if="panelTab === 'local'" data-testid="local-pane">
      <p
        v-if="localTabs.length === 0"
        class="text-body-2 text-grey mb-3"
        data-testid="no-local-plans"
      >
        Every plan in your tab bar is already on the cloud.
      </p>
      <!-- The same card, and the same two-row/two-column layout, a cloud plan gets in
           CloudPlanRow. No last-changed line: a local tab carries no timestamp of its
           own (app-store's `lastEdit` is one stamp for the whole browser, not per plan),
           and repeating that one value on every card would say they were all edited at
           the same moment. -->
      <v-card
        v-for="tab in localTabs"
        :key="tab.id"
        class="factory-card plan-card mb-2"
        data-testid="local-plan"
      >
        <div class="plan-grid">
          <div class="align-center d-flex ga-2 plan-title">
            <span class="flex-grow-1 plan-name text-truncate">{{ tab.name }}</span>
          </div>

          <div class="align-center d-flex ga-2 plan-meta text-caption text-grey">
            <v-tooltip location="top">
              <template #activator="{ props: countProps }">
                <v-chip
                  class="sf-chip factory x-small no-margin"
                  data-testid="local-plan-factory-count"
                  v-bind="countProps"
                >
                  <i class="fas fa-industry mr-1" />{{ tab.factories.length }}
                </v-chip>
              </template>
              <span>{{ factoryCountLabel(tab.factories.length) }} in this plan</span>
            </v-tooltip>
            <v-tooltip v-if="localLastChanged(tab.id)" location="top">
              <template #activator="{ props: timeProps }">
                <span
                  class="text-no-wrap text-truncate"
                  data-testid="local-plan-last-changed"
                  v-bind="timeProps"
                >{{ localLastChanged(tab.id) }}</span>
              </template>
              <span>Last changed {{ localLastChangedExact(tab.id) }}</span>
            </v-tooltip>
          </div>

          <div class="align-center d-flex plan-action">
            <v-tooltip location="top">
              <template #activator="{ props: convertProps }">
                <v-btn
                  color="green"
                  data-testid="convert-local-plan"
                  icon="fas fa-cloud-upload-alt"
                  :loading="convertingId === tab.id"
                  size="x-small"
                  variant="flat"
                  v-bind="convertProps"
                  @click="convert(tab.id)"
                />
              </template>
              <span>Send this plan to the cloud</span>
            </v-tooltip>
          </div>
        </div>
      </v-card>
      <p v-if="localTabs.length > 0" class="text-body-2 mt-1 text-grey">
        A local plan lives in this browser only. Send it to the cloud and it follows your
        account to every device you sign in on.
      </p>
    </div>

    <div v-else data-testid="cloud-pane">
      <div data-testid="my-plans">
        <!-- A heading has to outrank the plan names under it. At text-body-2 it was
             SMALLER than they are, and read as one more plan in the list.

             The icons are the tab bar's own vocabulary for what a tab is, from
             TabNavigation.vue: a cloud for a synced tab, a group of people for a
             collaborative one. Fixed-width so both headings start their text at the
             same x despite the two glyphs being different widths. -->
        <p class="text-h6 mb-2 plans-heading" data-testid="my-plans-heading">
          <i class="fas fa-cloud fa-fw mr-2" />My Plans
        </p>
        <p
          v-if="ownedRooms.length === 0"
          class="text-body-2 text-grey mb-3"
          data-testid="no-owned-plans"
        >
          None yet. Make one from the + button on the tab bar, or send a local plan to the
          cloud from the Local tab.
        </p>
        <cloud-plan-row
          v-for="room in ownedRooms"
          :key="room.roomId"
          data-testid="my-plan"
          :loading="togglingId === room.roomId"
          :now="now"
          :open="isOpen(room.roomId)"
          :room="room"
          @toggle="toggleOpen"
        />
      </div>

      <div v-if="joinedRooms.length > 0" class="mt-3" data-testid="joined-plans">
        <p class="text-h6 mb-2 plans-heading" data-testid="joined-plans-heading">
          <i class="fas fa-users fa-fw mr-2" />Joined Plans
        </p>
        <cloud-plan-row
          v-for="room in joinedRooms"
          :key="room.roomId"
          data-testid="joined-plan"
          :loading="togglingId === room.roomId"
          :now="now"
          :open="isOpen(room.roomId)"
          :room="room"
          @toggle="toggleOpen"
        />
      </div>
    </div>

    <v-divider class="my-3" />

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
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import CloudPlanRow from '@/components/sync/CloudPlanRow.vue'
  import { useAppStore } from '@/stores/app-store'
  import { useAuthStore } from '@/stores/auth-store'
  import { useRoomSyncStore } from '@/stores/room-sync-store'
  import { OFFLINE_MESSAGE, useRoomsStore } from '@/stores/rooms-store'
  import { usePlanActivityStore } from '@/stores/plan-activity-store'
  import { absoluteTime, relativeTimeLong } from '@/utils/relative-time'

  const props = withDefaults(defineProps<{
    /** True while the account tray is showing this panel. */
    open?: boolean
  }>(), { open: true })

  const appStore = useAppStore()
  const authStore = useAuthStore()
  const roomsStore = useRoomsStore()
  const roomSync = useRoomSyncStore()
  const planActivity = usePlanActivityStore()

  const username = computed(() => authStore.loggedInUser)

  // ===== Local and Cloud lists =====

  const panelTab = ref<'local' | 'cloud'>('local')

  const localTabs = computed(() =>
    appStore.getTabs().filter(tab => appStore.getTabState(tab.id).kind === 'local')
  )

  /** Spelled out for the tooltip; the chip itself is the icon and the number. */
  const factoryCountLabel = (count: number) =>
    `${count} ${count === 1 ? 'factory' : 'factories'}`

  /**
   * When this browser last saw a local plan's CONTENT change. plan-activity-store already
   * keeps one stamp per tab for the tab bar's own last-updated line — renames and reorders
   * deliberately excluded — so a local plan says the same thing a cloud plan does without
   * anything new being stored. A cloud plan keeps using the server's `lastActivityAt`
   * instead: that one is stamped by the server's clock and follows the plan across devices,
   * where this is only what this browser has seen.
   *
   * Empty until this browser has seen the plan change, and empty stays empty — the same
   * rule CloudPlanRow follows for an unreadable stamp.
   */
  const localStamp = (tabId: string): string | null => {
    const at = planActivity.lastUpdatedAt(tabId)
    return at ? new Date(at).toISOString() : null
  }

  const localLastChanged = (tabId: string) => {
    const at = localStamp(tabId)
    if (at === null) return ''
    const elapsed = relativeTimeLong(at, now.value)
    return elapsed === '' ? '' : `Last updated ${elapsed}`
  }

  const localLastChangedExact = (tabId: string) => absoluteTime(localStamp(tabId) ?? undefined)

  const rooms = computed(() =>
    Object.values(roomsStore.entries).sort((a, b) => a.order - b.order)
  )
  const ownedRooms = computed(() => rooms.value.filter(room => room.role === 'owner'))
  const joinedRooms = computed(() => rooms.value.filter(room => room.role !== 'owner'))

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
      case 'offlinePrompt': return { label: 'You appear to be offline', color: 'amber', icon: 'fa-exclamation-triangle' }
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

  // ===== Show and hide =====

  /** Open means a tab for the room exists in this browser; the bar is the set. */
  const openIds = computed(() => new Set(appStore.getTabs().map(tab => tab.id)))
  const isOpen = (roomId: string) => openIds.value.has(roomId)

  const togglingId = ref('')

  /** Refusals (offline, last tab) already toast from the store; nothing to add. */
  const toggleOpen = async (roomId: string) => {
    togglingId.value = roomId
    try {
      if (isOpen(roomId)) roomsStore.hidePlan(roomId)
      else await roomsStore.openPlan(roomId)
    } finally {
      togglingId.value = ''
    }
  }

  // ===== Convert to cloud =====

  const convertingId = ref('')

  /** The adoption path: same server call the sign-in offer uses, for one tab. */
  const convert = async (tabId: string) => {
    convertingId.value = tabId
    try {
      await roomsStore.adoptTabs([tabId])
    } finally {
      convertingId.value = ''
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
    // Every session ends with the change, this one included, so say so before it happens.
    passwordSuccess.value = 'Password changed. Every device signed in on the old password, including this one, has to sign in again.'
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

<style lang="scss" scoped>
  // `text-h6` carries its own `font-weight: 400 !important`, which beats the
  // `font-weight-bold` utility — a class that reads as bold and silently is not. The
  // weight is set here instead, where it actually lands.
  .plans-heading {
    font-weight: 700 !important;
  }

  // Vuetify draws the switch's thumb 6px to the LEFT of the control's own box (and the
  // track 4px), so the thumb is free to overhang as it slides. Everything else in this
  // tray — the username, the connection chip, the tabs, the body copy — starts at one x,
  // and the switch alone poked out of that column. Nudged back by the thumb's overhang
  // rather than the track's: the thumb is the high-contrast edge the eye lines up on.
  .offline-switch {
    margin-left: 6px;
  }

  // The same two-row/two-column grid CloudPlanRow lays its cards out on, so the two
  // tabs of this panel agree. Kept in step by hand: scoped styles cannot be shared, and
  // one small grid in two files beat a third component for a purely visual layout.
  .plan-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 8px;
    row-gap: 2px;
    padding: 8px 10px;
  }

  .plan-title {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
  }

  .plan-meta {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
  }

  .plan-action {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  // The square-ish corner the planner gives every button in a factory card, which the
  // dropped `.header` rule used to supply. Without it Vuetify's `.v-btn--icon` rounds
  // this one to a circle while the Show/Hide buttons opposite stay square.
  .plan-action .v-btn {
    border-radius: 4px;
  }

  .plan-name {
    line-height: 1.25;
  }
</style>
