<template>
  <app-dialog
    v-model="open"
    card-class="border-md"
    close-id="close-tab-settings"
    data-testid="tab-settings-dialog"
    :icon="signingIn ? 'fas fa-sign-in' : 'fas fa-pen'"
    max-width="560"
    :title="signingIn ? 'Sign in to convert' : 'Tab settings'"
  >
    <!-- The account tray's own form, so there is one sign-in in the planner and this
         dialog never has to close to reach it. -->
    <auth-form
      v-if="signingIn"
      intro="Sign in or register, and this plan can then be sent to the cloud."
      @authenticated="onAuthenticated"
    />

    <template v-else>
      <div class="align-center d-flex ga-2">
        <v-text-field
          v-model="name"
          data-testid="tab-name-field"
          density="compact"
          :disabled="!canRename"
          hide-details
          label="Tab name"
          @blur="applyRename"
          @input="dirty = true"
          @keydown.enter="applyRename"
        />
        <v-btn
          color="primary"
          data-testid="tab-name-apply"
          :disabled="!canRename"
          :loading="renaming"
          variant="flat"
          @click="applyRename"
        >Apply</v-btn>
      </div>
      <p v-if="!canRename" class="mt-2 text-caption text-grey" data-testid="rename-refusal">
        Only the owner can rename this plan.
      </p>
      <p v-if="renameError" class="mt-2 text-body-2 text-red" data-testid="rename-error">
        {{ renameError }}
      </p>

      <!-- Every kind gets in: a snapshot link needs no room, and the dialog itself
           explains what a local or non-owned tab cannot do. -->
      <v-divider class="my-4" />
      <p class="mb-3 text-caption text-grey">{{ shareBlurb }}</p>
      <v-btn
        color="blue"
        data-testid="share-settings"
        variant="flat"
        @click="shareOpen = true"
      >
        <i class="fas fa-share-alt mr-2" />Share Settings
      </v-btn>

      <!-- Hiding is the per-browser move and conversion is the account-wide one, so
           this sits above them: the gentler answer to "get this out of my tab bar",
           and the one that is undone from the plus button rather than by re-uploading. -->
      <template v-if="canHide">
        <v-divider class="my-4" />
        <p class="mb-3 text-caption text-grey">
          Hide this tab and it closes in this browser only. The plan stays on your account,
          and on any other device it is open on. To open it again, use the + button on the
          tab bar or your account panel.
        </p>
        <!-- The muted grey the rest of the app uses for secondary actions: on the dark
             theme an uncoloured flat button is near enough invisible. -->
        <v-btn
          color="grey-darken-1"
          data-testid="hide-tab"
          variant="flat"
          @click="hideTab"
        >
          <i class="fas fa-eye-slash mr-2" />Hide tab
        </v-btn>
        <p v-if="hideError" class="mt-3 text-body-2 text-red" data-testid="hide-error">
          {{ hideError }}
        </p>
      </template>

      <!-- Moved here from the tab bar, where it was an icon nobody could name. -->
      <template v-if="kind !== 'local'">
        <v-divider class="my-4" />
        <p class="mb-3 text-caption text-grey">
          Take a copy of this plan as a local tab. The copy lives in this browser only and
          goes its own way; this plan carries on exactly as it is.
        </p>
        <!-- The planner's own "Export plan" colour, so the two read as the same kind of act. -->
        <v-btn
          color="secondary"
          data-testid="duplicate-tab"
          variant="flat"
          @click="duplicate"
        >
          <i class="fas fa-copy mr-2" />Copy to a local tab
        </v-btn>
      </template>

      <template v-if="kind === 'local'">
        <v-divider class="my-4" />
        <p class="mb-3 text-caption text-grey">
          This plan lives in this browser only. Convert it to a cloud plan and it follows
          your account to every device you sign in on.
        </p>
        <!-- Signed out this is the way in to the sign-in form rather than a dead button.
             Keyed span: FA swaps the <i> for an SVG, so the icon has to be replaced
             wholesale rather than have its classes flipped. -->
        <v-btn
          color="green"
          data-testid="convert-to-cloud"
          :loading="converting"
          variant="flat"
          @click="startConvertToCloud"
        >
          <span :key="isLoggedIn ? 'cloud' : 'sign-in'" class="mr-2">
            <i :class="isLoggedIn ? 'fas fa-cloud-upload-alt' : 'fas fa-sign-in'" />
          </span>{{ isLoggedIn ? 'Convert to cloud' : 'Sign in to convert' }}
        </v-btn>
        <p
          v-if="!isLoggedIn"
          class="mt-3 text-caption text-grey"
          data-testid="convert-cloud-reassurance"
        >
          You do <strong>not</strong> need an account to use this planner. It is there should
          you wish to have a saved copy of your plan, or to share it with others. It is not
          mandatory.
        </p>
      </template>

      <template v-else-if="isOwner">
        <v-divider class="my-4" />
        <template v-if="!confirmingLocal">
          <p class="mb-3 text-caption text-grey">
            Convert this plan to a local tab and it comes off your account, staying in
            this browser only.
          </p>
          <v-btn
            color="orange"
            data-testid="convert-to-local"
            variant="flat"
            @click="confirmingLocal = true"
          >
            <i class="fas fa-desktop mr-2" />Convert to local
          </v-btn>
        </template>
        <template v-else>
          <p class="mb-3 text-amber text-caption" data-testid="convert-to-local-warning">
            {{ ownerWarning }}
          </p>
          <div class="d-flex ga-2 justify-end">
            <v-btn
              data-testid="cancel-convert-to-local"
              variant="text"
              @click="confirmingLocal = false"
            >Cancel</v-btn>
            <v-btn
              color="orange"
              data-testid="confirm-convert-to-local"
              :loading="converting"
              variant="flat"
              @click="convertToLocal"
            >Yes, convert to local</v-btn>
          </div>
        </template>
      </template>

      <template v-else-if="isJoinedLike">
        <v-divider class="my-4" />
        <p class="mb-3 text-caption text-grey">
          This is someone else's shared plan. Convert it to local and you leave the plan;
          your copy stays in this browser as a local tab.
        </p>
        <v-btn
          color="orange"
          data-testid="convert-to-local"
          :loading="converting"
          variant="flat"
          @click="convertToLocal"
        >
          <i class="fas fa-desktop mr-2" />Convert to local
        </v-btn>
      </template>

      <p v-if="convertError" class="mt-3 text-body-2 text-red" data-testid="convert-error">
        {{ convertError }}
      </p>

      <!-- Last, and walled off: the bin used to sit in the tab bar one mis-click from
           the plan beside it. Nothing below this line is recoverable. -->
      <template v-if="canDelete">
        <v-divider class="my-4" />
        <div class="danger-zone pa-3 rounded" data-testid="danger-zone">
          <p class="font-weight-bold mb-1 text-body-2 text-red">{{ deleteHeading }}</p>
          <p class="mb-3 text-caption text-grey">{{ deleteBlurb }}</p>
          <v-btn
            color="red"
            data-testid="delete-tab"
            :loading="deleting"
            variant="flat"
            @click="deleteTab"
          >
            <i class="fas fa-trash mr-2" />{{ deleteLabel }}
          </v-btn>
          <p v-if="deleteError" class="mb-0 mt-3 text-body-2 text-red" data-testid="delete-error">
            {{ deleteError }}
          </p>
        </div>
      </template>
    </template>

    <template v-if="signingIn" #actions>
      <v-btn data-testid="cancel-sign-in" variant="text" @click="signingIn = false">Back</v-btn>
    </template>
  </app-dialog>

  <share-dialog v-model="shareOpen" :tab-id="tabId" />
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import AppDialog from '@/components/common/AppDialog.vue'
  import AuthForm from '@/components/sync/AuthForm.vue'
  import ShareDialog from '@/components/sync/ShareDialog.vue'
  import { useAppStore } from '@/stores/app-store'
  import { useAuthStore } from '@/stores/auth-store'
  import { useRoomsStore } from '@/stores/rooms-store'
  import { isCollaborative } from '@/sync/tab-sync-state'
  import eventBus from '@/utils/eventBus'
  import { confirmDialog } from '@/utils/helpers'

  /**
   * Everything one tab is, in one place: its name, whether it lives on the
   * cloud, and how it is shared. Opened from the pencil on the selected tab.
   * All the heavy lifting is existing store plumbing — adoption for local to
   * cloud, the owner delete / member leave path for cloud to local.
   */
  const props = defineProps<{ tabId: string }>()
  const open = defineModel<boolean>({ default: false })

  const appStore = useAppStore()
  const authStore = useAuthStore()
  const roomsStore = useRoomsStore()

  const tab = computed(() => appStore.getTab(props.tabId))
  const state = computed(() => appStore.getTabState(props.tabId))
  const kind = computed(() => state.value.kind)
  const isOwner = computed(() => kind.value === 'synced' && state.value.role === 'owner')
  const isJoinedLike = computed(() =>
    kind.value === 'joined' || (kind.value === 'synced' && state.value.role !== 'owner'))
  const collaborative = computed(() => isCollaborative(state.value))
  /**
   * Only a membership can be hidden: the account list is what offers it back, and a
   * local tab or a link-joined one has no entry there, so closing either would be a
   * deletion wearing a gentler word.
   */
  const canHide = computed(() => kind.value === 'synced')
  const isLoggedIn = computed(() => authStore.isLoggedIn)
  const canRename = computed(() => roomsStore.canRename(props.tabId))

  const shareBlurb = computed(() => {
    if (kind.value === 'local') return 'Snapshot links for this plan. Sharing it live needs a cloud plan.'
    if (!collaborative.value) return 'Snapshot links, and the invite link that brings other people in.'
    if (isOwner.value) return 'Invite links, passwords and who can join this plan.'
    // A visitor joined by link and has no membership row, so no slug to show them.
    return kind.value === 'joined'
      ? 'Snapshot links. Only the owner can change how this plan is shared.'
      : 'Snapshot links, and the invite link for this plan.'
  })

  // ===== Rename =====

  const name = ref('')
  const dirty = ref(false)
  const renaming = ref(false)
  const renameError = ref('')
  const converting = ref(false)
  const convertError = ref('')
  const confirmingLocal = ref(false)
  const shareOpen = ref(false)
  const signingIn = ref(false)
  const hideError = ref('')
  const deleting = ref(false)
  const deleteError = ref('')

  /** The tab bar never goes below one tab, so the last one cannot be deleted. */
  const canDelete = computed(() => appStore.getTabs().length > 1)

  const duplicate = () => {
    if (!roomsStore.duplicateAsLocal(props.tabId)) return
    eventBus.emit('toast', { message: 'Copied to a local tab.', type: 'success' })
    open.value = false
  }

  const deleteHeading = computed(() =>
    isOwner.value || kind.value === 'local' ? 'Delete this plan' : 'Leave this plan')

  const deleteLabel = computed(() => {
    if (kind.value === 'local') return 'Delete this tab'
    return isOwner.value ? 'Delete this plan' : 'Leave and remove this plan'
  })

  const deleteBlurb = computed(() => {
    if (kind.value === 'local') return 'This tab and everything in it goes, from this browser. There is no undo.'
    if (isOwner.value) {
      return state.value.shared
        ? 'This deletes the plan from your account and takes it from everyone you shared it with. There is no undo.'
        : 'This deletes the plan from your account, on every device. There is no undo.'
    }
    return 'This removes the shared plan from your tabs and gives up your access. The owner keeps theirs.'
  })

  /** Verbatim from the tab bar's bin, which this replaces: same words, same warning. */
  const deleteWarning = (): string => {
    if (isOwner.value) {
      return state.value.shared
        ? 'This deletes the plan for everyone you shared it with. This action is irreversible!'
        : 'This deletes the plan from your account on every device. This action is irreversible!'
    }
    if (kind.value !== 'local') {
      return 'This removes the shared plan from your tabs. The owner keeps theirs.'
    }
    return 'Are you sure you wish to delete this tab? This action is irreversible!'
  }

  const deleteTab = async () => {
    const emptyLocalTab = kind.value === 'local' && (tab.value?.factories.length ?? 0) === 0
    if (!emptyLocalTab && !confirmDialog(deleteWarning())) return

    deleting.value = true
    deleteError.value = ''
    const result = await roomsStore.removeTab(props.tabId)
    deleting.value = false

    if (result !== true) {
      deleteError.value = result
      eventBus.emit('toast', { message: `Could not delete this tab: ${result}`, type: 'error' })
      return
    }
    appStore.removeTab(props.tabId)
    open.value = false
  }

  /**
   * The tab goes, the room and the membership stay. A refusal (offline, or the last
   * tab in the bar) keeps the dialog up with the reason on it; the store toasts it too.
   */
  const hideTab = () => {
    const result = roomsStore.hidePlan(props.tabId)
    if (result !== true) {
      hideError.value = result
      return
    }
    open.value = false
  }

  watch(open, isOpen => {
    if (!isOpen) return
    name.value = tab.value?.name ?? ''
    dirty.value = false
    renameError.value = ''
    convertError.value = ''
    confirmingLocal.value = false
    signingIn.value = false
    hideError.value = ''
    deleteError.value = ''
  }, { immediate: true })

  // A rename landing from another device follows into an untouched field.
  watch(() => tab.value?.name, fresh => {
    if (!dirty.value && fresh !== undefined) name.value = fresh
  })

  /** Apply, Enter and blur all land here; an unchanged name is a no-op. */
  const applyRename = async () => {
    if (!canRename.value || renaming.value) return
    const trimmed = name.value.trim()
    if (trimmed === (tab.value?.name ?? '')) return

    renaming.value = true
    const result = await roomsStore.renameTab(props.tabId, trimmed)
    renaming.value = false

    if (result === true) {
      renameError.value = ''
      dirty.value = false
      name.value = trimmed
      return
    }
    renameError.value = result
  }

  // ===== Cloud and local conversions =====

  const ownerWarning = computed(() => state.value.shared
    ? 'This removes the plan from your account and stops the live sharing. ' +
      'Everyone you shared it with keeps their copy as a local tab, and so do you.'
    : 'This removes the plan from your account on every device. ' +
      'The plan stays in this browser as a local tab.')

  /** Signed out, the button asks for the account it needs instead of sitting greyed out. */
  const startConvertToCloud = async () => {
    if (!isLoggedIn.value) {
      signingIn.value = true
      return
    }
    await convertToCloud()
  }

  /**
   * Sign-in starts the room list fetch, and adopting a tab while that is in flight
   * comes back missing from the list and is reverted. So the settings body only
   * returns, with its now-live convert button, once the session has landed.
   */
  const onAuthenticated = async () => {
    await roomsStore.whenSessionReady()
    signingIn.value = false
  }

  /** The adoption path: the same server call the sign-in offer uses, for one tab. */
  const convertToCloud = async () => {
    converting.value = true
    convertError.value = ''
    try {
      await roomsStore.adoptTabs([props.tabId])
    } finally {
      converting.value = false
    }
    // Adoption toasts its own failures; this catches the silent offline refusal.
    if (appStore.getTabState(props.tabId).kind === 'local') {
      convertError.value = roomsStore.lastError ?? 'The plan could not be sent to the cloud.'
    }
  }

  /** Owner: delete the room, keep the tab. Member or visitor: leave, keep the tab. */
  const convertToLocal = async () => {
    converting.value = true
    convertError.value = ''
    const result = await roomsStore.removeTab(props.tabId)
    converting.value = false
    confirmingLocal.value = false

    if (result !== true) {
      convertError.value = result
      return
    }
    eventBus.emit('toast', { message: 'This plan is now a local tab in this browser.', type: 'success' })
  }
</script>

<style lang="scss" scoped>
// Walled off rather than merely last: the tinted panel is what stops the eye
// treating Delete as one more of the settings above it.
.danger-zone {
  background-color: rgba(244, 67, 54, 0.08);
  border: 1px solid rgba(244, 67, 54, 0.4);
}
</style>
