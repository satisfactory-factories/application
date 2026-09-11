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
  for (let i = 0; i < 10; i++) {
    const counter = document.querySelector('.slide-counter')?.textContent?.trim() ?? ''
    const [current, total] = counter.split('/').map(part => Number(part.trim()))
    if (current === total) return
    // Next is always last: the Back button only exists from slide 2 onwards.
    nextButton()?.click()
    await nextTick()
  }
}

// v0.7 is the current release and owns the automatic show. This deck is history: it opens only
// when the v0.7 deck's last slide asks for it, and it holds nobody in it.
describe('SplashV6', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    localStorage.clear()
    localStorage.setItem('dismissed-introduction', 'true')
  })

  const mount = () => vuetifyRender(SplashV6)

  const reopen = async () => {
    mount()
    eventBus.emit('splashShowV6', undefined)
    await nextTick()
  }

  it('should never open on its own', async () => {
    mount()

    eventBus.emit('loadingCompleted')
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    expect(isOpen()).toBe(false)
  })

  // The header's "Show changes" belongs to the current release's deck now. This one answers
  // only to its own event, or two decks open on top of each other every time it is pressed.
  it('should not answer the header button that opens the current deck', async () => {
    mount()

    eventBus.emit('splashShow')
    await nextTick()

    expect(isOpen()).toBe(false)
  })

  it('should open when the v0.7 deck hands off to it', async () => {
    await reopen()

    expect(isOpen()).toBe(true)
  })

  // Reference material rather than a warning: there is no tour to walk, nothing to answer and
  // nothing holding them in it, whichever slide they are on.
  it('should let them leave from slide 1', async () => {
    await reopen()

    expect(closeButton()).not.toBeNull()
    expect(nextButton().disabled).toBe(false)

    closeButton()!.click()
    await nextTick()

    expect(isOpen()).toBe(false)
  })

  it('should mark itself seen when closed', async () => {
    await reopen()

    await goToLastSlide()
    nextButton().click()
    await nextTick()

    expect(isOpen()).toBe(false)
    expect(localStorage.getItem('seenV6Splash')).toBe('true')
  })

  // The chain carries on backwards. Every deck is mounted for the whole session, so this one
  // has to be off screen before the next is asked for or they stack.
  it('should close itself when handing off to the v0.5 deck', async () => {
    const handOff = vi.fn()
    eventBus.on('splashShowV5', handOff)
    await reopen()
    await goToLastSlide()

    buttonWith("What's new in Beta v0.5")?.click()
    await nextTick()

    expect(handOff).toHaveBeenCalled()
    expect(isOpen()).toBe(false)
    eventBus.off('splashShowV5', handOff)
  })

  // The Raw Resources Wizard is still in Options, and this deck is where it is explained — so
  // stepping aside for it is a pause, not a close.
  it('should come back where it left off once the wizard is done', async () => {
    await reopen()
    const slide = document.querySelector('.slide-counter')?.textContent?.trim()

    buttonWith('Run the Raw Resources Wizard')?.click()
    await vi.advanceTimersByTimeAsync(500)

    expect(isOpen()).toBe(false)

    eventBus.emit('rawWizardClosed')
    await nextTick()

    expect(isOpen()).toBe(true)
    expect(document.querySelector('.slide-counter')?.textContent?.trim()).toBe(slide)
  })

  it('should not come back a second time', async () => {
    await reopen()
    buttonWith('Run the Raw Resources Wizard')?.click()
    await vi.advanceTimersByTimeAsync(500)
    eventBus.emit('rawWizardClosed')
    await nextTick()

    closeButton()?.click()
    await nextTick()
    eventBus.emit('rawWizardClosed')
    await nextTick()

    expect(isOpen()).toBe(false)
  })
})
