<template>
  <app-dialog
    v-model="open"
    card-class="border-md"
    close-id="close-share-dialog"
    close-title="Close share settings"
    data-testid="share-dialog"
    icon="fas fa-share-alt"
    max-width="760"
    :title="dialogTitle"
  >
    <section class="share-section snapshot mb-6" data-testid="snapshot-section">
      <h3 class="text-h6 mb-1">
        <i class="fas fa-camera mr-2" />Copy snapshot link
      </h3>
      <p class="text-body-2 mb-3">
        A frozen copy of this plan exactly as it is right now. Whoever opens it gets their
        own separate copy to keep. It never updates and needs no account.
      </p>
      <!-- Hidden while the link on screen still matches the plan: a second snapshot of
           identical bytes is two links to the same dead copy, which is what reopening
           this dialog used to mint. An edit brings the button back. -->
      <v-btn
        v-if="!snapshotIsCurrent"
        color="blue"
        data-testid="create-snapshot"
        :disabled="!capabilities.canSnapshot"
        :loading="creatingSnapshot"
        variant="flat"
        @click="createSnapshot"
      >
        <i class="fas fa-camera mr-2" />Create snapshot link
      </v-btn>
      <div v-if="snapshotLink" class="mt-3">
        <p v-if="restoredSnapshot" class="mb-2 text-body-2 text-grey" data-testid="snapshot-unchanged">
          The link you made earlier. This plan has not changed since, so it is still the
          same snapshot; edit the plan and you can take a fresh one.
        </p>
        <v-text-field
          data-testid="snapshot-link"
          hide-details
          :model-value="snapshotLink"
          readonly
        />
        <v-btn
          class="mt-2"
          color="blue"
          data-testid="copy-snapshot"
          variant="tonal"
          @click="copy(snapshotLink, 'snapshot')"
        >
          <span :key="copiedKey === 'snapshot' ? 'done' : 'copy'" class="mr-2">
            <i :class="copiedKey === 'snapshot' ? 'fas fa-check' : 'fas fa-copy'" />
          </span>{{ copiedKey === 'snapshot' ? 'Copied!' : 'Copy snapshot link' }}
        </v-btn>
      </div>
      <p v-if="snapshotError" class="mt-2 text-body-2 text-red">{{ snapshotError }}</p>
    </section>

    <v-divider class="mb-6" />

    <section class="share-section invite" data-testid="invite-section">
      <h3 class="text-h6 mb-1">
        <i class="fas fa-users mr-2" />Invite collaborators
      </h3>
      <p class="text-body-2 mb-3">
        A live link into <em>this</em> plan. Everyone who opens it edits the same plan as you,
        as you work. Changes appear on both sides straight away.
      </p>

      <p
        v-if="capabilities.blockedReason"
        class="text-body-2 text-amber"
        data-testid="invite-blocked"
      >{{ capabilities.blockedReason }}</p>
      <p
        v-if="capabilities.blockedDetail"
        class="mt-2 text-body-2"
        data-testid="invite-blocked-detail"
      >{{ capabilities.blockedDetail }}</p>

      <template v-if="capabilities.canManageInvite">
        <v-btn
          v-if="!capabilities.isShared"
          color="green"
          data-testid="create-invite"
          :loading="busy"
          variant="flat"
          @click="startSharing"
        >
          <i class="fas fa-user-plus mr-2" />Create invite link
        </v-btn>

        <template v-else>
          <v-text-field
            data-testid="invite-link"
            hide-details
            :model-value="capabilities.inviteLink ?? ''"
            readonly
          />
          <v-btn
            class="mt-2"
            color="green"
            data-testid="copy-invite"
            variant="tonal"
            @click="copy(capabilities.inviteLink ?? '', 'invite')"
          >
            <span :key="copiedKey === 'invite' ? 'done' : 'copy'" class="mr-2">
              <i :class="copiedKey === 'invite' ? 'fas fa-check' : 'fas fa-copy'" />
            </span>{{ copiedKey === 'invite' ? 'Copied!' : 'Copy invite link' }}
          </v-btn>

          <v-divider class="my-4" />

          <p class="text-body-2 mb-2 font-weight-bold">Custom link</p>
          <v-text-field
            v-model="slug"
            data-testid="slug-input"
            :error="slugStatus === 'invalid' || slugStatus === 'taken'"
            :hint="slugMessage"
            label="three-word-slug"
            persistent-hint
          />
          <v-btn
            class="mt-2"
            color="green"
            data-testid="apply-slug"
            :disabled="!slugUsable"
            :loading="busy"
            variant="tonal"
            @click="applySlug"
          >Use this link</v-btn>

          <v-divider class="my-4" />

          <p class="text-body-2 mb-2 font-weight-bold">
            <i class="fas fa-lock mr-2" />
            {{ capabilities.hasPassword ? 'Password protected' : 'No password' }}
          </p>
          <p class="text-body-2 mb-2">
            A password is asked for once, when someone new opens the link. Changing it kicks
            anyone who joined anonymously; people signed in keep their access.
          </p>
          <v-text-field
            v-model="password"
            data-testid="password-input"
            :label="capabilities.hasPassword ? 'New password' : 'Password'"
            type="password"
          />
          <div class="d-flex ga-2">
            <v-btn
              color="green"
              data-testid="set-password"
              :disabled="password.length === 0"
              :loading="busy"
              variant="tonal"
              @click="applyPassword"
            >{{ capabilities.hasPassword ? 'Change password' : 'Set password' }}</v-btn>
            <v-btn
              v-if="capabilities.hasPassword"
              data-testid="remove-password"
              :loading="busy"
              variant="text"
              @click="clearPassword"
            >Remove password</v-btn>
          </div>

          <v-divider class="my-4" />

          <v-btn
            color="red"
            data-testid="stop-sharing"
            :loading="busy"
            variant="tonal"
            @click="stopSharing"
          >
            <i class="fas fa-user-slash mr-2" />Stop sharing
          </v-btn>
          <p class="text-body-2 mt-2">
            Everyone else loses access and keeps their own local copy. The link dies; sharing
            again restores the same one.
          </p>
        </template>
      </template>

      <div v-else-if="capabilities.inviteLink" class="mt-2">
        <v-text-field
          data-testid="invite-link"
          hide-details
          :model-value="capabilities.inviteLink"
          readonly
        />
        <v-btn
          class="mt-2"
          color="green"
          data-testid="copy-invite"
          variant="tonal"
          @click="copy(capabilities.inviteLink, 'invite')"
        >
          <span :key="copiedKey === 'invite' ? 'done' : 'copy'" class="mr-2">
            <i :class="copiedKey === 'invite' ? 'fas fa-check' : 'fas fa-copy'" />
          </span>{{ copiedKey === 'invite' ? 'Copied!' : 'Copy invite link' }}
        </v-btn>
      </div>

      <p v-if="inviteError" class="mt-2 text-body-2 text-red">{{ inviteError }}</p>
    </section>
  </app-dialog>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
  import { ApiError, ApiNetworkError, createSnapshotShare } from '@/api/client'
  import { useSlugAvailability } from '@/composables/useSlugAvailability'
  import { useAppStore } from '@/stores/app-store'
  import { useRoomSyncStore } from '@/stores/room-sync-store'
  import { OFFLINE_MESSAGE, useRoomsStore } from '@/stores/rooms-store'
  import { shareCapabilities } from '@/sync/share-capabilities'
  import {
    fingerprintPlan,
    pruneSnapshotLinks,
    readSnapshotLink,
    rememberSnapshotLink,
  } from '@/sync/snapshot-links'
  import eventBus from '@/utils/eventBus'

  const props = defineProps<{ tabId: string }>()
  const open = defineModel<boolean>({ default: false })

  const appStore = useAppStore()
  const roomsStore = useRoomsStore()
  const roomSync = useRoomSyncStore()

  const creatingSnapshot = ref(false)
  const snapshotLink = ref('')
  const snapshotError = ref('')
  /** The link on screen freezes the plan exactly as it stands, so no new one is owed. */
  const snapshotIsCurrent = ref(false)
  /** ...and it was made in an earlier visit to this dialog, which is worth saying. */
  const restoredSnapshot = ref(false)
  const busy = ref(false)
  const inviteError = ref('')
  const password = ref('')

  const {
    slug,
    status: slugStatus,
    message: slugMessage,
    usable: slugUsable,
    reset: resetSlug,
    stop: stopSlugChecks,
  } = useSlugAvailability(() => props.tabId)

  const tabName = computed(() => appStore.getTab(props.tabId)?.name ?? 'this plan')
  const dialogTitle = computed(() => `Share "${tabName.value}"`)

  const capabilities = computed(() => shareCapabilities(
    appStore.getTabState(props.tabId),
    roomsStore.entries[props.tabId],
    window.location.origin,
    roomSync.isSuppressed,
  ))

  // ===== Snapshot half =====

  // Plain text: this is rendered as text, and an anchor tag would be shown verbatim.
  const snapshotFailure = (error: unknown): string => {
    if (error instanceof ApiNetworkError) return 'The backend server is offline. Please report this on Discord.'
    if (error instanceof ApiError) {
      if (error.status === 429) return 'You are being rate limited. Please wait a little before trying again.'
      return 'Failed to create the snapshot link. Please report this on Discord.'
    }
    return 'Failed to create the snapshot link for an unknown reason. Please report this on Discord.'
  }

  const snapshotUrl = (shareId: string) => `${window.location.origin}/share/${shareId}`

  /** The plan as `POST /share` receives it, which is the thing being frozen. */
  const planFingerprint = (): string | null => {
    const tab = appStore.getTab(props.tabId)
    return tab ? fingerprintPlan(toRaw(tab)) : null
  }

  /**
   * Puts the last link back on screen when the plan has not moved since. Reopening
   * the dialog on an untouched plan therefore shows the link it already handed out
   * rather than minting a duplicate of the same frozen bytes.
   */
  const restoreSnapshot = () => {
    snapshotLink.value = ''
    snapshotError.value = ''
    snapshotIsCurrent.value = false
    restoredSnapshot.value = false

    const stored = readSnapshotLink(props.tabId)
    if (!stored || stored.fingerprint !== planFingerprint()) return

    snapshotLink.value = snapshotUrl(stored.shareId)
    snapshotIsCurrent.value = true
    restoredSnapshot.value = true
  }

  const createSnapshot = async () => {
    const tab = appStore.getTab(props.tabId)
    snapshotError.value = ''
    snapshotLink.value = ''
    snapshotIsCurrent.value = false
    restoredSnapshot.value = false

    if (!tab || tab.factories.length === 0) {
      snapshotError.value = 'There is nothing in this plan to share yet.'
      return
    }
    if (roomSync.isSuppressed) {
      snapshotError.value = OFFLINE_MESSAGE
      return
    }

    creatingSnapshot.value = true
    try {
      // Fingerprinted from the payload actually sent, so the record can never claim
      // an edit made mid-request was part of the snapshot.
      const payload = toRaw(tab)
      const fingerprint = fingerprintPlan(payload)
      const { shareId } = await createSnapshotShare(payload)
      snapshotLink.value = snapshotUrl(shareId)
      snapshotIsCurrent.value = true
      rememberSnapshotLink(props.tabId, { shareId, fingerprint })
      await copy(snapshotLink.value, 'snapshot')
    } catch (error) {
      snapshotError.value = snapshotFailure(error)
    } finally {
      creatingSnapshot.value = false
    }
  }

  // ===== Invite half =====

  const run = async (action: () => Promise<true | string>) => {
    busy.value = true
    inviteError.value = ''
    const result = await action()
    busy.value = false
    if (result !== true) inviteError.value = result
    return result === true
  }

  const startSharing = () => run(() => roomsStore.shareTab(props.tabId))

  const applySlug = async () => {
    const candidate = slug.value.trim().toLowerCase()
    if (await run(() => roomsStore.shareTab(props.tabId, candidate))) resetSlug()
  }

  const applyPassword = async () => {
    if (await run(() => roomsStore.setTabPassword(props.tabId, password.value))) password.value = ''
  }

  const clearPassword = async () => {
    if (await run(() => roomsStore.removeTabPassword(props.tabId))) password.value = ''
  }

  const stopSharing = () => run(() => roomsStore.unshareTab(props.tabId))

  // ===== Shared =====

  // ===== Copying =====

  /**
   * Which button last copied. The button says so for a moment rather than only the
   * toast: the link is copied for you the instant it is made, and a button that
   * still reads "Copy" is the one thing on screen saying otherwise.
   */
  const copiedKey = ref('')
  const COPIED_MS = 2500
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  const flashCopied = (key: string) => {
    copiedKey.value = key
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copiedKey.value = '' }, COPIED_MS)
  }

  const copy = async (url: string, key = '') => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      if (key) flashCopied(key)
      eventBus.emit('toast', { message: 'Link copied to clipboard!' })
    } catch {
      // Some browsers refuse clipboard access outright; the field is selectable.
      eventBus.emit('toast', { message: 'Copy the link from the box above.', type: 'info' })
    }
  }

  watch(open, value => {
    if (!value) {
      snapshotLink.value = ''
      snapshotError.value = ''
      snapshotIsCurrent.value = false
      restoredSnapshot.value = false
      inviteError.value = ''
      password.value = ''
      copiedKey.value = ''
      clearTimeout(copiedTimer)
      resetSlug()
      return
    }

    // Nothing else sweeps these, and a tab closed long ago would keep its link.
    pruneSnapshotLinks(appStore.getTabs().map(tab => tab.id))
    restoreSnapshot()
  }, { immediate: true })

  onBeforeUnmount(() => {
    clearTimeout(copiedTimer)
    stopSlugChecks()
  })
</script>

<style lang="scss" scoped>
// The two halves must never be mistaken for each other: one hands over a dead
// copy, the other hands over write access to this plan.
.share-section {
  border-left: 4px solid;
  padding-left: 12px;
}

.share-section.snapshot {
  border-left-color: var(--sf-product);
}

.share-section.invite {
  border-left-color: var(--sf-success);
}
</style>
