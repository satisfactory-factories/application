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

// Only reached by "run the wizard", which needs to be on the planner before it can ask for it.
vi.mock('vue-router', () => ({
  useRouter: () => ({ currentRoute: { value: { path: '/' } }, push: vi.fn() }),
}))

import SplashV6 from './SplashV6.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { useAppStore } from '@/stores/app-store'
import eventBus from '@/utils/eventBus'

// v-dialog teleports into the body and leaves its content there once closed, so "is it open" is
// the overlay's own state — not whether some slide's words are in the DOM, which stays true after
// the deck has gone and is false merely for being on a different slide.
const isOpen = () => !!document.querySelector('.v-overlay--active')

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

    // Holding someone on a red banner about plans they have not got teaches them the warning is
    // noise — and a plan made after the change is stamped as answered the moment it exists.
    it('should not warn or lock anyone whose plan cannot be affected', async () => {
      mount()
      await finishLoading()

      expect(document.body.textContent).not.toContain('Action needed')
      expect(closeButton()).not.toBeNull()
      expect(nextButton().disabled).toBe(false)
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

      it('should warn about existing plans and offer no way out', async () => {
        await openWithNoticePending()

        expect(document.body.textContent).toContain('Action needed')
        expect(closeButton()).toBeNull()
        // Slide 1 cannot be skipped past until it is answered.
        expect(nextButton().disabled).toBe(true)
      })

      it('should take the notice off screen and offer the wizard', async () => {
        await openWithNoticePending()

        expect(appStore.deferRawBreakingNotice).toHaveBeenCalled()
        expect(buttonWith('Run the wizard')).toBeDefined()
        expect(buttonWith("I'll sort it myself")).toBeDefined()
      })

      // Nobody reads a footer. The decision the deck will not open without has to sit where the
      // warning is, not in the corner of the card actions.
      it('should put the same choice directly under the banner', async () => {
        await openWithNoticePending()

        const banner = document.querySelector('.action-banner')!
        const prompt = document.querySelector('.action-choice')!

        expect(banner.nextElementSibling).toBe(prompt)
        expect(prompt.textContent).toContain('Fix my plans with the Raw Resources Wizard')
        expect(prompt.textContent).toContain("I understand, I'll fix my plans myself")
      })

      // The lock is on the question, not on the tour. Answering it either way — the wizard or
      // "I'll sort it myself" — leaves an ordinary deck, so declining does not cost seven slides.
      it('should open the exit as soon as the question is answered', async () => {
        await openWithNoticePending()

        expect(closeButton()).toBeNull()

        buttonWith("I'll sort it myself")?.click()
        await nextTick()

        expect(closeButton()).not.toBeNull()

        closeButton()!.click()
        await nextTick()

        expect(isOpen()).toBe(false)
        expect(localStorage.getItem('seenV6Splash')).toBe('true')
      })

      it('should still let them walk the tour to the end instead', async () => {
        await openWithNoticePending()
        buttonWith("I'll sort it myself")?.click()
        await nextTick()

        await goToLastSlide()
        nextButton().click()
        await nextTick()

        expect(isOpen()).toBe(false)
        expect(localStorage.getItem('seenV6Splash')).toBe('true')
      })

      // Running the wizard is an exit part way through the tour, and the rest of the release is
      // what the deck is for — so stepping aside for it is a pause, not a close.
      it('should come back where it left off once the wizard is done', async () => {
        await openWithNoticePending()
        const slide = document.querySelector('.slide-counter')?.textContent?.trim()

        buttonWith('Fix my plans with the Raw Resources Wizard')?.click()
        await vi.advanceTimersByTimeAsync(500)

        expect(isOpen()).toBe(false)

        eventBus.emit('rawWizardClosed')
        await nextTick()

        expect(isOpen()).toBe(true)
        expect(document.querySelector('.slide-counter')?.textContent?.trim()).toBe(slide)
        // Answered on the way out, so from here it is an ordinary deck they can close.
        expect(closeButton()).not.toBeNull()
        expect(nextButton().disabled).toBe(false)
      })

      it('should not come back a second time', async () => {
        await openWithNoticePending()
        buttonWith('Fix my plans with the Raw Resources Wizard')?.click()
        await vi.advanceTimersByTimeAsync(500)
        eventBus.emit('rawWizardClosed')
        await nextTick()

        closeButton()?.click()
        await nextTick()
        eventBus.emit('rawWizardClosed')
        await nextTick()

        expect(isOpen()).toBe(false)
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

  // Reopened from the header long after the news landed: reference material rather than a
  // warning, so there is no tour to walk, nothing to answer and nothing holding them in it.
  describe('when it is opened by hand', () => {
    const reopen = async () => {
      localStorage.setItem('seenV6Splash', 'true')
      mount()
      eventBus.emit('splashShow')
      await nextTick()
    }
    const closeButton = () => document.querySelector('.v-card-title button')
    const nextButton = () =>
      [...document.querySelectorAll('.v-card-actions button')].at(-1) as HTMLButtonElement

    it('should let them leave from slide 1', async () => {
      await reopen()

      expect(isOpen()).toBe(true)
      expect(closeButton()).not.toBeNull()
      // Nothing to answer this time — they can walk straight past it.
      expect(nextButton().disabled).toBe(false)
    })
  })

  // A brand new visitor dismisses the introduction seconds before their first plan finishes
  // loading. Opening on the back of that lands a release deck on top of someone's first ever
  // look at the planner, so it waits for their next visit instead — as v0.5's deck did.
  describe('a first-time visitor', () => {
    beforeEach(() => {
      localStorage.setItem('dismissed-introduction', 'false')
    })

    it('should not be shown the deck in the session they dismissed the introduction', async () => {
      mount()

      await finishLoading()
      expect(isOpen()).toBe(false)

      // What Introduction.vue does when it closes: writes the key, then says so.
      localStorage.setItem('dismissed-introduction', 'true')
      eventBus.emit('introDismissed')
      await finishLoading()

      expect(isOpen()).toBe(false)
    })

    // Not marked seen, or the deck would be lost rather than deferred.
    it('should still be waiting for them next time', async () => {
      mount()
      localStorage.setItem('dismissed-introduction', 'true')
      eventBus.emit('introDismissed')
      await finishLoading()

      expect(localStorage.getItem('seenV6Splash')).toBeNull()

      document.body.innerHTML = ''
      mount()
      await finishLoading()

      expect(isOpen()).toBe(true)
    })
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

    // Step off slide 1, which is the only slide with no way out.
    ;([...document.querySelectorAll('.v-card-actions button')].at(-1) as HTMLElement).click()
    await nextTick()
    document.querySelector<HTMLElement>('.v-card-title button')?.click()
    await nextTick()

    expect(localStorage.getItem('seenV6Splash')).toBe('true')
  })
})
