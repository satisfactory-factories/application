<template>
  <v-btn
    color="blue rounded"
    :disabled="creating"
    icon="fas fa-share-alt"
    size="small"
    variant="flat"
    @click="createShareLink"
  />
  <v-dialog v-model="showCopyDialog" max-width="600">
    <v-card>
      <v-card-title>Copy the link below</v-card-title>
      <v-card-text>
        <p class="mb-4">Annoyingly your device / browser doesn't support copying to clipboard automatically. Please copy the link below manually.</p>
        <v-text-field v-model="link" readonly />
        <div class="text-center">
          <v-btn color="green" variant="flat" @click="copyLink(link)"><i class="fas fa-copy mr-2" />Copy</v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
  import { config } from '@/config/config'
  import { useAppStore } from '@/stores/app-store'
  import { useAuthStore } from '@/stores/auth-store'
  import { FactoryTab } from '@/interfaces/planner/FactoryInterface'
  import { ShareDataCreationResponse } from '@/interfaces/ShareDataInterface'
  import eventBus from '@/utils/eventBus'

  // Get user auth stuff from the app store
  const { currentFactoryTab } = useAppStore()
  const authStore = useAuthStore()

  const apiUrl = config.apiUrl
  const creating = ref(false)
  const link = ref()
  const showCopyDialog = ref(false)

  const createShareLink = async () => {
    if (!currentFactoryTab.factories || currentFactoryTab.factories.length === 0) {
      alert('No factory data to share!')
      return
    }

    creating.value = true
    link.value = await handleCreation(currentFactoryTab) ?? ''
    creating.value = false

    // If no link was returned assume server errors
    if (!link.value) {
      return
    }

    console.log('ShareButton: Link created', link.value)

    try {
      await copyLink(link.value)
    } catch (err) {
      if (err instanceof Error && err.message.includes('not allowed by the user agent')) {
        console.error('Failed to copy link to clipboard, showing share dialog', err)
        showCopyDialog.value = true
      }
    }
  }

  const handleCreation = async (factoryTabData: FactoryTab) => {
    creating.value = true
    let token: string
    try {
      token = await authStore.getToken()
    } catch {
      // Do nothing
      token = ''
    }

    try {
      const response = await fetch(`${apiUrl}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(factoryTabData),
      })
      if (response.ok) {
        const data: ShareDataCreationResponse = await response.json()
        return `${window.location.origin}/share/${data.shareId}`
      } else if (response.status === 429) {
        console.error('Share Error: Rate limited')
        eventBus.emit('toast', { message: 'You are being rate limited. Stop spamming that button! Please wait some time before trying again.', type: 'error' })
      } else if (response.status === 500) {
        console.error('Share Error: Server error', response)
        eventBus.emit('toast', { message: 'A server error has occurred trying to create the share link. Please report this on <a href="https://discord.gg/zge68PrGJ7">Discord</a>!', type: 'error' })
      } else if (response.status === 502) {
        console.error('Share Error: Gateway timeout', response)
        eventBus.emit('toast', { message: 'The backend server is offline! Please report this with urgency on <a href="https://discord.gg/zge68PrGJ7">Discord</a>, ping @Maelstrome directly!', type: 'error' })
      } else {
        console.error('Share Error: Unknown response', response.body)
        eventBus.emit('toast', { message: 'Failed to create share link. Please report this error on our <a href="https://discord.gg/zge68PrGJ7">Discord</a>!', type: 'error' })
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Share Error (catchall):', error)
        if (error.message.includes('NetworkError')) {
          eventBus.emit('toast', { message: 'The backend server is offline! Please report this with urgency on <a href="https://discord.gg/zge68PrGJ7">Discord</a>, ping @Maelstrome directly!', type: 'error' })
          return
        }
        eventBus.emit('toast', { message: 'Failed to create share link due to unknown error. Please report this error on our <a href="https://discord.gg/zge68PrGJ7">Discord</a>!', type: 'error' })
      }
    }
  }

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url)
    eventBus.emit('toast', { message: 'Link copied to clipboard!' })
    showCopyDialog.value = false
  }
</script>
