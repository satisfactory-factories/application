import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { gameData } from '@/utils/gameData'

// Slide 1 and slide 5 carry the sink and Depot art, and its component throws outright without
// the data behind it.
vi.mock('@/stores/game-data-store', () => ({
  useGameDataStore: () => ({
    getGameData: () => gameData,
    loadGameData: async () => {},
  }),
}))

import SplashV7 from './SplashV7.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import eventBus from '@/utils/eventBus'

// v-dialog teleports into the body and leaves its content there once closed, so "is it open" is
// the overlay's own state — not whether some slide's words are in the DOM, which stays true after
// the deck has gone and is false merely for being on a different slide.
const isOpen = () => !!document.querySelector('.v-overlay--active')

const closeButton = () => document.querySelector<HTMLElement>('.v-card-title button')
const nextButton = () =>
  [...document.querySelectorAll('.v-card-actions button')].at(-1) as HTMLButtonElement
const buttonWith = (text: string) => [...document.querySelectorAll('button')]
  .find(b => b.textContent?.includes(text)) as HTMLElement | undefined

// Walk to the end of the deck by clicking its Next button, whatever the slide count is. Each
// click has to settle before the next one: the counter it reads is rendered a tick later.
const goToLastSlide = async () => {
  for (let i = 0; i < 12; i++) {
    const counter = document.querySelector('.slide-counter')?.textContent?.trim() ?? ''
    const [current, total] = counter.split('/').map(part => Number(part.trim()))
    if (current === total) return
    nextButton()?.click()
    await nextTick()
  }
}

// The deck waits for the plan to settle before it opens; the wait is debounced by 750ms.
const finishLoading = async () => {
  eventBus.emit('loadingCompleted')
  await vi.advanceTimersByTimeAsync(1000)
  await nextTick()
}

describe('SplashV7', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    localStorage.clear()
    // The introduction is the first thing a brand new user sees; this deck waits behind it.
    localStorage.setItem('dismissed-introduction', 'true')
  })

  const mount = () => vuetifyRender(SplashV7)

  it('should open once the plan has finished loading', async () => {
    mount()
    expect(isOpen()).toBe(false)

    await finishLoading()

    expect(isOpen()).toBe(true)
  })

  it('should not open for someone who has already seen it', async () => {
    localStorage.setItem('seenV7Splash', 'true')
    mount()

    await finishLoading()

    expect(isOpen()).toBe(false)
  })

  // v0.6 was unskippable because raw resources broke every existing plan and needed an answer.
  // v0.7 breaks nothing the user has to act on — the old cloud save is brought over on its own —
  // so there is nothing to hold anyone in this one.
  it('should be closable from the corner on the first slide', async () => {
    mount()
    await finishLoading()

    expect(closeButton()).not.toBeNull()
    expect(nextButton().disabled).toBe(false)

    closeButton()!.click()
    await nextTick()

    expect(isOpen()).toBe(false)
    expect(localStorage.getItem('seenV7Splash')).toBe('true')
  })

  it('should mark itself seen once walked to the end', async () => {
    mount()
    await finishLoading()

    await goToLastSlide()
    nextButton().click()
    await nextTick()

    expect(isOpen()).toBe(false)
    expect(localStorage.getItem('seenV7Splash')).toBe('true')
  })

  it('should open on demand even after it has been dismissed', async () => {
    localStorage.setItem('seenV7Splash', 'true')
    mount()

    eventBus.emit('splashShow')
    await nextTick()

    expect(isOpen()).toBe(true)
  })

  // The chain: v0.7 hands off to v0.6, which hands off to v0.5. Every deck is mounted for the
  // whole session, so this one has to be off screen before the next is asked for or they stack.
  it('should close itself when handing off to the v0.6 deck', async () => {
    const handOff = vi.fn()
    eventBus.on('splashShowV6', handOff)
    mount()
    await finishLoading()
    await goToLastSlide()

    buttonWith("What's new in Beta v0.6")?.click()
    await nextTick()

    expect(handOff).toHaveBeenCalled()
    expect(isOpen()).toBe(false)
    eventBus.off('splashShowV6', handOff)
  })

  // A brand new visitor dismisses the introduction seconds before their first plan finishes
  // loading. Opening on the back of that lands a release deck on top of someone's first ever
  // look at the planner, so it waits for their next visit instead — as v0.5's and v0.6's did.
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

      expect(localStorage.getItem('seenV7Splash')).toBeNull()

      document.body.innerHTML = ''
      mount()
      await finishLoading()

      expect(isOpen()).toBe(true)
    })
  })
})
