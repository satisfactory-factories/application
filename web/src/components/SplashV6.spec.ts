import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { gameData } from '@/utils/gameData'

// The slides carry game art, and its component throws outright without the data behind it.
vi.mock('@/stores/game-data-store', () => ({
  useGameDataStore: () => ({
    getGameData: () => gameData,
    loadGameData: async () => {},
  }),
}))

import SplashV6 from './SplashV6.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { useAppStore } from '@/stores/app-store'
import eventBus from '@/utils/eventBus'

// v-dialog teleports its content to the document body, so assertions read from there.
const isOpen = () => (document.body.textContent ?? '').includes('The "Groundwork" Update is here!')

// Walk to the end of the deck by clicking its Next button, whatever the slide count is. Each
// click has to settle before the next one: the counter it reads is rendered a tick later.
const goToLastSlide = async () => {
  for (let i = 0; i < 10; i++) {
    const counter = document.querySelector('.slide-counter')?.textContent?.trim() ?? ''
    const [current, total] = counter.split('/').map(part => Number(part.trim()))
    if (current === total) return
    // Next is always last: the Back button only exists from slide 2 onwards.
    ;([...document.querySelectorAll('.v-card-actions button')].at(-1) as HTMLElement)?.click()
    await nextTick()
  }
}

// The deck waits for the plan to settle before it opens; the wait is debounced by 750ms.
const finishLoading = async () => {
  eventBus.emit('loadingCompleted')
  await vi.advanceTimersByTimeAsync(1000)
  await nextTick()
}

describe('SplashV6', () => {
  let appStore: ReturnType<typeof useAppStore>

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    localStorage.clear()
    // The introduction is the first thing a brand new user sees; this deck waits behind it.
    localStorage.setItem('dismissed-introduction', 'true')
  })

  const mount = () => {
    vuetifyRender(SplashV6)
    appStore = useAppStore()
    appStore.showRawBreakingNotice = false
  }

  it('should open once the plan has finished loading', async () => {
    mount()
    expect(isOpen()).toBe(false)

    await finishLoading()

    expect(isOpen()).toBe(true)
  })

  it('should not open for someone who has already seen it', async () => {
    localStorage.setItem('seenV6Splash', 'true')
    mount()

    await finishLoading()

    expect(isOpen()).toBe(false)
  })

  // The deck speaks for the breaking notice rather than queuing behind it: both ship in the same
  // release, so otherwise a returning user is handed two dialogs saying the same thing.
  describe('when the plan predates the breaking change', () => {
    const openWithNoticePending = async () => {
      mount()
      appStore.showRawBreakingNotice = true
      await nextTick()
      await finishLoading()
    }

    const closeButton = () => document.querySelector<HTMLElement>('.v-card-title button')

    it('should take the notice off screen and demand a decision', async () => {
      await openWithNoticePending()

      expect(isOpen()).toBe(true)
      expect(appStore.deferRawBreakingNotice).toHaveBeenCalled()
      expect(document.body.textContent).toContain('Action needed')
      // No X while the decision is outstanding — the slide's own buttons are the only way out.
      expect(closeButton()).toBeNull()
    })

    // Deferred, not dismissed: a tab closed on this slide must get the warning again next load.
    it('should not mark the notice seen until the user actually answers', async () => {
      await openWithNoticePending()

      expect(appStore.dismissRawBreakingNotice).not.toHaveBeenCalled()
    })

    it('should unlock once the user says they will sort it themselves', async () => {
      await openWithNoticePending()

      const sortItMyself = [...document.querySelectorAll('button')]
        .find(b => b.textContent?.includes("I'll sort it myself"))
      sortItMyself?.click()
      await nextTick()

      expect(appStore.dismissRawBreakingNotice).toHaveBeenCalled()
      expect(closeButton()).not.toBeNull()
    })

    it('should refuse to close while the decision is outstanding', async () => {
      await openWithNoticePending()

      // The last slide's primary button, which reads "Got it!" and closes for everyone else.
      await goToLastSlide()
      const primary = [...document.querySelectorAll('.v-card-actions button')].at(-1) as HTMLElement
      primary.click()
      await nextTick()

      // Still open, and back on the slide carrying the decision.
      expect(localStorage.getItem('seenV6Splash')).toBeNull()
      expect(isOpen()).toBe(true)
    })

    it('should not ask someone with no plan to do anything', async () => {
      mount()
      // The store only raises the notice for a plan with factories in it.
      appStore.showRawBreakingNotice = false
      await finishLoading()

      expect(isOpen()).toBe(true)
      expect(document.body.textContent).not.toContain('Action needed')
      expect(closeButton()).not.toBeNull()
    })
  })

  it('should wait behind the introduction, and open when it is dismissed', async () => {
    localStorage.setItem('dismissed-introduction', 'false')
    mount()

    await finishLoading()
    expect(isOpen()).toBe(false)

    // What Introduction.vue does when it closes: writes the key, then says so.
    localStorage.setItem('dismissed-introduction', 'true')
    eventBus.emit('introDismissed')
    await nextTick()

    expect(isOpen()).toBe(true)
  })

  it('should open on demand even after it has been dismissed', async () => {
    localStorage.setItem('seenV6Splash', 'true')
    mount()

    eventBus.emit('splashShow')
    await nextTick()

    expect(isOpen()).toBe(true)
  })

  it('should mark itself seen when closed', async () => {
    mount()
    await finishLoading()

    eventBus.emit('splashShow') // no-op, already open — the close is what matters
    const closed = document.querySelector<HTMLElement>('.v-card-title button')
    closed?.click()
    await nextTick()

    expect(localStorage.getItem('seenV6Splash')).toBe('true')
  })
})
