<template>
  <v-dialog v-model="open" max-width="720">
    <v-card class="border-md">
      <v-card-title class="text-h5">New tab</v-card-title>
      <v-card-text>
        <div class="d-flex flex-column flex-md-row ga-4">
          <v-card
            class="choice flex-1-1 pa-4"
            data-testid="choose-local-tab"
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
            :disabled="busy || !isLoggedIn"
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

        <p v-if="!isLoggedIn" class="mt-4 text-body-2 text-amber">
          Sign in to create a synced tab. Local tabs stay exactly as they are, and you can
          sync them whenever you like.
        </p>
        <p v-if="error" class="mt-4 text-body-2 text-red">{{ error }}</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="busy" variant="text" @click="open = false">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/stores/app-store'
  import { useAuthStore } from '@/stores/auth-store'
  import { useRoomsStore } from '@/stores/rooms-store'

  const open = defineModel<boolean>({ default: false })

  const appStore = useAppStore()
  const roomsStore = useRoomsStore()
  const { isLoggedIn } = storeToRefs(useAuthStore())

  const busy = ref(false)
  const error = ref('')

  const chooseLocal = () => {
    appStore.addTab()
    open.value = false
  }

  const chooseSynced = async () => {
    if (!isLoggedIn.value) return
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

  watch(open, value => {
    if (value) error.value = ''
  })
</script>

<style lang="scss" scoped>
.choice {
  cursor: pointer;
}
</style>
