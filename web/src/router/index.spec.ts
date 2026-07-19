import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import vuetify from '@/plugins/vuetify'
import router from '@/router'
import RecipesPage from '@/pages/recipes.vue'
import { fetchGameData } from '@/utils/gameDataService'

// @ts-ignore // this is fine, it works, stop moaning
const gameData = await fetchGameData()

// The navigation guard loads game data and starts the sync tick before every
// route; both stores are mocked so tests exercise the routing behaviour only.
// getGameData is stubbed with the real fixture data because navigating loads
// the page components, whose imports read from the store.
const loadGameData = vi.fn(async () => {})
const setupTick = vi.fn()

vi.mock('@/stores/game-data-store', () => ({
  useGameDataStore: () => ({
    loadGameData,
    getGameData: () => gameData,
  }),
}))
vi.mock('@/stores/sync-store', () => ({
  useSyncStore: () => ({ setupTick }),
}))

describe('router', () => {
  beforeEach(() => {
    loadGameData.mockClear()
    loadGameData.mockImplementation(async () => {})
    setupTick.mockClear()
  })

  describe('generated route table', () => {
    it.each([
      '/',
      '/parts',
      '/recipes',
      '/changelog',
      '/graph',
      '/error',
    ])('resolves the file-based route %s', path => {
      const resolved = router.resolve(path)
      expect(resolved.matched.length).toBeGreaterThan(0)
    })

    it('resolves the dynamic share route with its id param', () => {
      const resolved = router.resolve('/share/some-share-id')
      expect(resolved.matched.length).toBeGreaterThan(0)
      expect(resolved.params).toEqual({ id: 'some-share-id' })
    })

    it('wraps pages in the default layout', () => {
      // setupLayouts nests each page under the layout component, so a page
      // route matches two records: the layout wrapper and the page itself.
      const resolved = router.resolve('/parts')
      expect(resolved.matched.length).toBe(2)
    })
  })

  describe('navigation guard', () => {
    it('loads game data and starts the sync tick, then completes navigation', async () => {
      await router.push('/parts')

      expect(loadGameData).toHaveBeenCalled()
      expect(setupTick).toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe('/parts')
    })

    it('cancels the navigation if game data fails to load', async () => {
      await router.push('/changelog')
      loadGameData.mockImplementation(async () => {
        throw new Error('boom')
      })

      await router.push('/graph').catch(() => {})

      expect(router.currentRoute.value.path).toBe('/changelog')
    })
  })

  describe('legacy /recipes route', () => {
    it('redirects to the parts browser', async () => {
      await router.push('/recipes')
      mount(RecipesPage, {
        global: { plugins: [vuetify, router] },
      })
      await router.isReady()
      // The page component replaces the route on setup
      await vi.waitFor(() => {
        expect(router.currentRoute.value.path).toBe('/parts')
      })
    })
  })
})
