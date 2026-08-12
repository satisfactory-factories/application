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

  // Nobody reads a dialog they can wave away, and this deck is the only warning most people get
  // that their saved plans now read differently. On the automatic showing it does not let go.
  describe('the automatic showing', () => {
    const closeButton = () => document.querySelector<HTMLElement>('.v-card-title button')
    const buttonWith = (text: string) => [...document.querySelectorAll('button')]
      .find(b => b.textContent?.includes(text)) as HTMLElement | undefined
    const nextButton = () =>
      [...document.querySelectorAll('.v-card-actions button')].at(-1) as HTMLButtonElement

    it('should warn about existing plans and offer no way out', async () => {
      mount()
      await finishLoading()

      expect(document.body.textContent).toContain('Action needed')
      expect(closeButton()).toBeNull()
      // Slide 1 cannot be skipped past until it is answered.
      expect(nextButton().disabled).toBe(true)
    })

    it('should let someone with no plan acknowledge and move on', async () => {
      mount()
      await finishLoading()

      expect(buttonWith("I'll sort it myself")).toBeUndefined()
      buttonWith('I understand')?.click()
      await nextTick()

      expect(nextButton().disabled).toBe(false)
    })

    it('should keep the exit shut until the tour has been walked', async () => {
      mount()
      await finishLoading()
      buttonWith('I understand')?.click()
      await nextTick()

      // Answering is not the exit: there is still no cross, only the end of the deck.
      expect(closeButton()).toBeNull()

      await goToLastSlide()
      nextButton().click()
      await nextTick()

      expect(isOpen()).toBe(false)
      expect(localStorage.getItem('seenV6Splash')).toBe('true')
    })

    // The deck speaks for the raw-resources notice rather than queuing behind it: both ship in
    // the same release, so otherwise a returning user is handed two dialogs saying the same thing.
    describe('when the plan predates the breaking change', () => {
      const openWithNoticePending = async () => {
        mount()
        appStore.showRawBreakingNotice = true
        await nextTick()
        await finishLoading()
      }

      it('should take the notice off screen and offer the wizard', async () => {
        await openWithNoticePending()

        expect(appStore.deferRawBreakingNotice).toHaveBeenCalled()
        expect(buttonWith('Run the wizard')).toBeDefined()
        expect(buttonWith("I'll sort it myself")).toBeDefined()
      })

      // Deferred, not dismissed: a tab closed on this slide must get the warning again next load.
      it('should not mark the notice seen until the user actually answers', async () => {
        await openWithNoticePending()

        expect(appStore.dismissRawBreakingNotice).not.toHaveBeenCalled()
      })

      it('should mark it seen once they say they will sort it themselves', async () => {
        await openWithNoticePending()

        buttonWith("I'll sort it myself")?.click()
        await nextTick()

        expect(appStore.dismissRawBreakingNotice).toHaveBeenCalled()
        expect(nextButton().disabled).toBe(false)
      })
    })
  })

  // Reopened from the header long after the news landed: reference material, not a warning.
  it('should not lock when it is opened by hand', async () => {
    localStorage.setItem('seenV6Splash', 'true')
    mount()

    eventBus.emit('splashShow')
    await nextTick()

    expect(isOpen()).toBe(true)
    expect(document.querySelector('.v-card-title button')).not.toBeNull()
    expect(([...document.querySelectorAll('.v-card-actions button')].at(-1) as HTMLButtonElement).disabled).toBe(false)
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
    localStorage.setItem('seenV6Splash', 'true')
    mount()
    eventBus.emit('splashShow')
    await nextTick()
    localStorage.removeItem('seenV6Splash')

    document.querySelector<HTMLElement>('.v-card-title button')?.click()
    await nextTick()

    expect(localStorage.getItem('seenV6Splash')).toBe('true')
  })
})
