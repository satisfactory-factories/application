<template>
  <app-dialog
    v-model="open"
    data-testid="service-notice-dialog"
    :icon="isOutage ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle'"
    max-width="640"
    scrollable
    :title="isOutage ? 'SF\'s servers are having connection trouble' : 'SF\'s servers are back to normal'"
    @update:model-value="value => { if (!value) remember() }"
  >
    <template v-if="isOutage">
      <p class="mb-3">
        SF's backend servers are having connectivity issues at the moment, because the internet
        provider they run on is suffering from packet loss. Until that is fixed, we recommend
        switching to <b>offline mode</b>. We'll show you another notice like this one once it's
        confirmed resolved.
      </p>
      <p class="mb-1">In offline mode:</p>
      <ul class="mb-3 ml-5">
        <li>You can keep planning as normal, without the "SF backend offline" warnings.</li>
        <li>Links you have already shared keep working for the people you sent them to.</li>
        <li class="font-weight-bold text-red" data-testid="service-notice-collab-warning">
          Syncing and collaborating on shared plans will not work until you go back online.
        </li>
        <li>
          All of your data stays safe in this browser, so nothing is lost. Your changes sync
          once you turn offline mode off again.
        </li>
      </ul>
      <p>
        We expect this to last a few more days, over the weekend, and sadly it's out of our hands.
        If it goes on for more than a week, we'll look at moving SF to a different host: it's all
        self-hosted at the moment.
      </p>
      <p class="mt-3">
        For further updates, join us on
        <a :href="DISCORD_INVITE" rel="noopener" target="_blank">Discord</a>.
      </p>
    </template>
    <template v-else>
      <p class="mb-3">
        The connectivity issues with SF's backend servers have been resolved, so signing in,
        sharing and syncing all work as normal again.
      </p>
      <p v-if="roomSync.isOffline">
        You're still in offline mode. Go back online to sync everything you changed while you
        were away. Nothing you did offline is lost.
      </p>
    </template>

    <template #actions>
      <!-- Pushed to the left: an aside, not one of the answers to the notice. -->
      <v-btn
        v-if="isOutage"
        color="amber"
        data-testid="service-notice-discord"
        :href="DISCORD_INVITE"
        prepend-icon="fab fa-discord"
        rel="noopener"
        target="_blank"
        variant="text"
      >Join our Discord for updates</v-btn>
      <v-spacer v-if="isOutage" />
      <template v-if="isOutage">
        <v-btn color="red" data-testid="service-notice-dismiss" variant="text" @click="dismiss">Stay online</v-btn>
        <v-btn color="primary" data-testid="service-notice-offline" variant="flat" @click="goOffline">Go offline</v-btn>
      </template>
      <template v-else-if="roomSync.isOffline">
        <v-btn color="red" data-testid="service-notice-dismiss" variant="text" @click="dismiss">Stay offline</v-btn>
        <v-btn color="primary" data-testid="service-notice-online" variant="flat" @click="goOnline">Go online</v-btn>
      </template>
      <v-btn
        v-else
        color="primary"
        data-testid="service-notice-dismiss"
        variant="flat"
        @click="dismiss"
      >Got it</v-btn>
    </template>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref } from 'vue'
  import AppDialog from '@/components/common/AppDialog.vue'
  import { useEventBusListener } from '@/composables/useEventBusListener'
  import { SERVICE_NOTICE, serviceNoticeDismissedKey } from '@/config/service-notice'
  import type { ServiceNotice } from '@/config/service-notice'
  import { useAppStore } from '@/stores/app-store'
  import { useAuthStore } from '@/stores/auth-store'
  import { useRoomSyncStore } from '@/stores/room-sync-store'

  // A prop only so a spec can hand it a notice; the app mounts it bare and reads the config.
  const props = defineProps<{ notice?: ServiceNotice | null }>()
  const notice = computed(() => (props.notice === undefined ? SERVICE_NOTICE : props.notice))

  /** The same invite the account tray and the introduction hand out. */
  const DISCORD_INVITE = 'https://discord.gg/vcFsjcWAFv'

  /** How long after a plan finishes loading before the notice goes up, so the page has settled. */
  const SHOW_DELAY_MS = 1_000

  const roomSync = useRoomSyncStore()
  const auth = useAuthStore()
  const appStore = useAppStore()

  const open = ref(false)
  const isOutage = computed(() => notice.value?.kind === 'outage')

  const read = (key: string): string | null => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  const answered = (notice: ServiceNotice) => read(serviceNoticeDismissedKey(notice.id)) === 'true'

  const remember = () => {
    if (!notice.value) return
    try {
      localStorage.setItem(serviceNoticeDismissedKey(notice.value.id), 'true')
    } catch {
      // Remembered for this page load only.
    }
  }

  // News about SF's servers matters to the people whose plans live on them: anyone signed in,
  // and anyone holding a synced or joined tab. A visitor planning locally loses nothing to an
  // outage, and a first visit has the introduction to get through without this on top.
  const affected = () =>
    auth.isLoggedIn || appStore.getTabs().some(tab => appStore.getTabState(tab.id).kind !== 'local')

  const shouldShow = (): boolean => {
    const current = notice.value
    if (!current || answered(current) || !affected()) return false
    // Already offline is already following the advice; the outage notice has nothing to add.
    if (current.kind === 'outage' && roomSync.isOffline) return false
    // The release deck is a dialog of its own; this waits for a load after it is closed.
    return read('seenV7Splash') === 'true'
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let shown = false

  // Shown once a plan has loaded rather than on mount, like the release deck, so the page is not
  // still resizing under the dialog.
  useEventBusListener('loadingCompleted', () => {
    if (shown) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (shown || !shouldShow()) return
      shown = true
      open.value = true
    }, SHOW_DELAY_MS)
  })

  onBeforeUnmount(() => clearTimeout(timer))

  const dismiss = () => {
    remember()
    open.value = false
  }

  const goOffline = () => {
    dismiss()
    if (!roomSync.isOffline) roomSync.enterOffline()
  }

  const goOnline = () => {
    dismiss()
    roomSync.exitOffline()
  }
</script>
