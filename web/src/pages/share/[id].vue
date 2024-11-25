<template>
  <h1 class="text-center">Loading share data...</h1>
</template>
<script setup lang="ts">
  import { ref } from 'vue'
  import { DataInterface } from '@/interfaces/DataInterface'
  import { useGameDataStore } from '@/stores/game-data-store'
  import { FactoryTab } from '@/interfaces/planner/FactoryInterface'
  import { config } from '@/config/config'
  import { ShareDataReturnResponse } from '@/interfaces/ShareDataInterface'
  import { useAppStore } from '@/stores/app-store'
  import { useRoute } from 'vue-router'
  import router from '@/router'

  const data = ref<DataInterface | null>({} as DataInterface)

  // The route guard ensures that the game data is always loaded by the time it gets here.
  const gameDataStore = useGameDataStore()
  data.value = gameDataStore.getGameData()

  const appStore = useAppStore()
  const route = useRoute()

  const loadedFactoryData = ref<FactoryTab>() // The data from the share link

  // On page load, check if there is a share ID in the URL and load the data if there is
  onMounted(() => {
    loadShareData()
  })

  const loadShareData = async () => {
    const shareId = (route.params as { id: string }).id

    if (shareId) {
      loadedFactoryData.value = await getDataFromShare(shareId)
      // Change the title of the tab to denote it's the shared one

      if (loadedFactoryData.value) {
        loadedFactoryData.value.name = `${loadedFactoryData.value.name} (shared)`
        appStore.addTab(loadedFactoryData.value)
      }
    }

    router.push('/')
  }

  const getDataFromShare = async (shareId: string): Promise<FactoryTab | undefined> => {
    const apiUrl = config.apiUrl

    // Make an API call to get the game data from the share ID
    try {
      const response = await fetch(`${apiUrl}/share/${shareId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const data: ShareDataReturnResponse = await response.json()
      if (response.ok) {
        console.log('Data:', data)

        if (!data.data) {
          alert('Failed to load share link, it contained invalid data.')
          return
        }

        // This is for legacy reasons, as previously created share links may contain an array of factories instead of a factory tab
        if (Array.isArray(data.data)) {
          return {
            id: crypto.randomUUID(),
            name: 'Shared Data',
            factories: data.data,
          }
        }

        return data.data
      } else {
        console.error('Loading share data failed:', data)
        alert(`Failed to load share link. Please report this error to GitHub! "${data}" `)
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error)
        alert(`Failed to load share link. Please report this error to GitHub! "${error.message}"`)
      }
    }
  }
</script>
