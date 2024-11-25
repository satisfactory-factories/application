/**
 * router/index.ts
 *
 * Automatic routes for `./src/pages/*.vue`
 */

// Composables
import { createRouter, createWebHistory } from 'vue-router/auto'
import { setupLayouts } from 'virtual:generated-layouts'
import { routes } from 'vue-router/auto-routes'
import { useGameDataStore } from '@/stores/game-data-store'
import { useAppStore } from '@/stores/app-store'
import { useSyncStore } from '@/stores/sync-store'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: setupLayouts(routes),
})

// Add a global navigation guard to load game data and set up data sync before every route
router.beforeEach(async (to, from, next) => {
  const gameDataStore = useGameDataStore()
  const syncStore = useSyncStore()
  syncStore.setupTick()

  // Check if the game data is already loaded
  try {
    await gameDataStore.loadGameData()
    console.log('Router: Game data loaded successfully from route')
  } catch (error) {
    console.error('Router: Failed to load game data:', error)
    // Optionally handle the error, e.g., redirect to an error page
    next(false) // Cancel the navigation if loading fails
    return
  }

  // If the route is not /error, check the factory data
  if (to.path === '/error') {
    next()
    return
  }

  // Check if the factory data has corrupted
  try {
    const appStore = useAppStore()
    appStore.getFactories()
  } catch (error) {
    if (error instanceof Error) {
      console.error('Router: Failed to load factory data:', error)
      localStorage.setItem('error', error.message)
      // Send the user to the error page
      next('/error')
      return
    }
    localStorage.setItem('error', 'Unknown error')
    next('/error')
    return
  }

  // Proceed to the route if data is loaded
  next()
})

// Workaround for https://github.com/vitejs/vite/issues/11804
router.onError((err, to) => {
  if (err?.message?.includes?.('Failed to fetch dynamically imported module')) {
    if (!localStorage.getItem('vuetify:dynamic-reload')) {
      console.log('Reloading page to fix dynamic import error')
      localStorage.setItem('vuetify:dynamic-reload', 'true')
      location.assign(to.fullPath)
    } else {
      console.error('Dynamic import error, reloading page did not fix it', err)
    }
  } else {
    console.error(err)
  }
})

router.isReady().then(() => {
  localStorage.removeItem('vuetify:dynamic-reload')
})

export default router
