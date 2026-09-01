<template>
  <app-dialog
    v-model="open"
    card-class="border-md"
    close-id="close-tab-settings"
    data-testid="tab-settings-dialog"
    icon="fas fa-pen"
    max-width="560"
    title="Tab settings"
  >
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
    <p v-if="!canRename" class="mt-2 text-body-2 text-grey" data-testid="rename-refusal">
      Only the owner can rename this plan.
    </p>
    <p v-if="renameError" class="mt-2 text-body-2 text-red" data-testid="rename-error">
      {{ renameError }}
    </p>

    <!-- Every kind gets in: a snapshot link needs no room, and the dialog itself
         explains what a local or non-owned tab cannot do. -->
    <v-divider class="my-4" />
    <p class="mb-3 text-body-2">{{ shareBlurb }}</p>
    <v-btn
      color="blue"
      data-testid="share-settings"
      variant="flat"
      @click="shareOpen = true"
    >
      <i class="fas fa-share-alt mr-2" />Share Settings
    </v-btn>

    <template v-if="kind === 'local'">
      <v-divider class="my-4" />
      <p class="mb-3 text-body-2">
        This plan lives in this browser only. Convert it to a cloud plan and it follows
        your account to every device you sign in on.
      </p>
      <!-- The activator wraps the button: a disabled button swallows pointer events,
           and the signed-out state is exactly when the tooltip has to show. -->
      <v-tooltip :disabled="isLoggedIn" location="top">
        <template #activator="{ props: cloudProps }">
          <span class="d-inline-block" v-bind="cloudProps">
            <v-btn
              color="green"
              data-testid="convert-to-cloud"
              :disabled="!isLoggedIn"
              :loading="converting"
              variant="flat"
              @click="convertToCloud"
            >
              <i class="fas fa-cloud-upload-alt mr-2" />Convert to cloud
            </v-btn>
          </span>
        </template>
        <span>You need to have an account for this, please register using the Sign in Pioneer button top right of the planner</span>
      </v-tooltip>
    </template>

    <template v-else-if="isOwner">
      <v-divider class="my-4" />
      <template v-if="!confirmingLocal">
        <p class="mb-3 text-body-2">
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
        <p class="mb-3 text-amber text-body-2" data-testid="convert-to-local-warning">
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
      <p class="mb-3 text-body-2">
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
  </app-dialog>

  <share-dialog v-model="shareOpen" :tab-id="tabId" />
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import AppDialog from '@/components/common/AppDialog.vue'
  import ShareDialog from '@/components/sync/ShareDialog.vue'
  import { useAppStore } from '@/stores/app-store'
  import { useAuthStore } from '@/stores/auth-store'
  import { useRoomsStore } from '@/stores/rooms-store'
  import { isCollaborative } from '@/sync/tab-sync-state'
  import eventBus from '@/utils/eventBus'

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
  const isLoggedIn = computed(() => authStore.isLoggedIn)
  const canRename = computed(() => roomsStore.canRename(props.tabId))

  const shareBlurb = computed(() => {
    if (kind.value === 'local') return 'Snapshot links for this plan. Sharing it live needs a cloud plan.'
    if (!collaborative.value) return 'Snapshot links, and the invite link that brings other people in.'
    return isOwner.value
      ? 'Invite links, passwords and who can join this plan.'
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

  watch(open, isOpen => {
    if (!isOpen) return
    name.value = tab.value?.name ?? ''
    dirty.value = false
    renameError.value = ''
    convertError.value = ''
    confirmingLocal.value = false
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
