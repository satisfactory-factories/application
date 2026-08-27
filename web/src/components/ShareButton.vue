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
  import { useAppStore } from '@/stores/app-store'
  import { ApiError, ApiNetworkError, createSnapshotShare } from '@/api/client'
  import { FactoryTab } from '@/interfaces/planner/FactoryInterface'
  import eventBus from '@/utils/eventBus'

  // Get user auth stuff from the app store
  const { currentFactoryTab } = useAppStore()

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

    try {
      // The client attaches the bearer token and the X-App-Version header the
      // version gate requires; without the latter every share request 426s.
      const data = await createSnapshotShare(factoryTabData)
      return `${window.location.origin}/share/${data.shareId}`
    } catch (error) {
      if (error instanceof ApiNetworkError) {
        console.error('Share Error: Network', error)
        eventBus.emit('toast', { message: 'The backend server is offline! Please report this with urgency on <a href="https://discord.gg/vcFsjcWAFv">Discord</a>, ping @Maelstrome directly!', type: 'error' })
        return
      }
      if (error instanceof ApiError) {
        if (error.status === 429) {
          console.error('Share Error: Rate limited')
          eventBus.emit('toast', { message: 'You are being rate limited. Stop spamming that button! Please wait some time before trying again.', type: 'error' })
          return
        }
        if (error.status === 500) {
          console.error('Share Error: Server error', error)
          eventBus.emit('toast', { message: 'A server error has occurred trying to create the share link. Please report this on <a href="https://discord.gg/vcFsjcWAFv">Discord</a>!', type: 'error' })
          return
        }
        if (error.status === 502) {
          console.error('Share Error: Gateway timeout', error)
          eventBus.emit('toast', { message: 'The backend server is offline! Please report this with urgency on <a href="https://discord.gg/vcFsjcWAFv">Discord</a>, ping @Maelstrome directly!', type: 'error' })
          return
        }
        console.error('Share Error: Unknown response', error)
        eventBus.emit('toast', { message: 'Failed to create share link. Please report this error on our <a href="https://discord.gg/vcFsjcWAFv">Discord</a>!', type: 'error' })
        return
      }
      console.error('Share Error (catchall):', error)
      eventBus.emit('toast', { message: 'Failed to create share link due to unknown error. Please report this error on our <a href="https://discord.gg/vcFsjcWAFv">Discord</a>!', type: 'error' })
    }
  }

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url)
    eventBus.emit('toast', { message: 'Link copied to clipboard!' })
    showCopyDialog.value = false
  }
</script>
