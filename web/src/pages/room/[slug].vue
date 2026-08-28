<template>
  <v-container class="room-join">
    <v-card v-if="phase === 'loading'" class="border-md" data-testid="room-loading">
      <v-card-title class="text-h5">Opening shared plan...</v-card-title>
      <v-card-text>
        <v-progress-linear indeterminate />
      </v-card-text>
    </v-card>

    <v-card v-else-if="phase === 'notFound'" class="border-md" data-testid="room-not-found">
      <v-card-title class="text-h5">This plan is not shared</v-card-title>
      <v-card-text>
        <p class="mb-2">
          Nothing is being shared at this link. Its owner may have stopped sharing it, or the
          plan may have been deleted.
        </p>
        <p>Ask whoever sent it to you for a fresh invite link.</p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" variant="flat" @click="goHome">Back to the planner</v-btn>
      </v-card-actions>
    </v-card>

    <v-card v-else-if="phase === 'password'" class="border-md" data-testid="room-password">
      <v-card-title class="text-h5">"{{ roomName }}" needs a password</v-card-title>
      <v-card-text>
        <p class="mb-4">Whoever shared this plan set a password on it. Enter it to join.</p>
        <v-form @submit.prevent="submitPassword">
          <v-text-field
            v-model="password"
            data-testid="room-password-input"
            label="Invite password"
            type="password"
          />
          <v-btn
            color="primary"
            data-testid="room-password-submit"
            :loading="busy"
            type="submit"
            variant="flat"
          >Join plan</v-btn>
        </v-form>
        <p v-if="error" class="mt-3 text-red" data-testid="room-error">{{ error }}</p>
      </v-card-text>
    </v-card>

    <v-card v-else class="border-md" data-testid="room-failed">
      <v-card-title class="text-h5">That did not work</v-card-title>
      <v-card-text>
        <p data-testid="room-error">{{ error }}</p>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" variant="flat" @click="goHome">Back to the planner</v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { ApiError, ApiNetworkError, authenticateRoom, lookupRoomBySlug } from '@/api/client'
  import { useAuthStore } from '@/stores/auth-store'
  import { useRoomsStore } from '@/stores/rooms-store'
  import { readVisitorToken, setVisitorToken } from '@/sync/visitor-tokens'

  type Phase = 'loading' | 'notFound' | 'password' | 'failed'

  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const roomsStore = useRoomsStore()

  const phase = ref<Phase>('loading')
  const roomId = ref('')
  const roomName = ref('')
  const hasPassword = ref(false)
  const password = ref('')
  const error = ref('')
  const busy = ref(false)

  const goHome = () => router.replace('/')

  const describe = (cause: unknown): string => {
    if (cause instanceof ApiNetworkError) return 'The server could not be reached. Try again in a moment.'
    if (cause instanceof ApiError) return cause.message
    return 'Something went wrong opening that plan.'
  }

  const resolve = async () => {
    const slug = String((route.params as { slug?: string }).slug ?? '')
    if (!slug) {
      phase.value = 'notFound'
      return
    }

    try {
      const lookup = await lookupRoomBySlug(slug)
      roomId.value = lookup.roomId
      roomName.value = lookup.name
      hasPassword.value = lookup.hasPassword
    } catch (cause) {
      // The lookup only resolves shared, live rooms, so a 404 is the honest answer
      // for unshared, deleted and never-existed alike.
      phase.value = cause instanceof ApiError && cause.status === 404 ? 'notFound' : 'failed'
      error.value = describe(cause)
      return
    }

    await enter(readVisitorToken(roomId.value))
  }

  /**
   * A signed-in member has already cleared the password once, so the join is tried
   * first and the form only appears when the server actually asks for it.
   */
  const enter = async (visitorToken?: string) => {
    if (authStore.isLoggedIn) {
      const outcome = await roomsStore.joinSharedRoom(roomId.value, {
        name: roomName.value,
        visitorToken,
      })
      if (outcome.ok) return goHome()

      if (outcome.code === 'password_required') {
        phase.value = 'password'
        error.value = visitorToken ? 'That password is no longer valid. Enter the new one.' : ''
        return
      }
      phase.value = 'failed'
      error.value = outcome.message
      return
    }

    if (hasPassword.value && !visitorToken) {
      phase.value = 'password'
      return
    }

    roomsStore.trackJoinedRoom(roomId.value, { name: roomName.value, visitorToken })
    goHome()
  }

  const submitPassword = async () => {
    if (busy.value) return
    error.value = ''
    busy.value = true

    try {
      const { visitorToken } = await authenticateRoom(roomId.value, password.value)
      setVisitorToken(roomId.value, visitorToken)
      await enter(visitorToken)
    } catch (cause) {
      // Stay on the form: a wrong password must never bounce the user anywhere.
      error.value = cause instanceof ApiError && cause.status === 401
        ? 'Incorrect password. Please try again.'
        : describe(cause)
    } finally {
      busy.value = false
    }
  }

  onMounted(resolve)
</script>

<style lang="scss" scoped>
.room-join {
  max-width: 640px;
}
</style>
