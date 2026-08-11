import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SplashV6 from './SplashV6.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { useAppStore } from '@/stores/app-store'
import eventBus from '@/utils/eventBus'

// v-dialog teleports its content to the document body, so assertions read from there.
const isOpen = () => (document.body.textContent ?? '').includes('The "Mining" Update is here!')

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

  // The breaking notice covers the same ground as slide 1 and is raised for anyone with an
  // existing plan, so the two must never be on screen at once.
  it('should wait behind the raw-resources breaking notice', async () => {
    mount()
    appStore.showRawBreakingNotice = true
    await nextTick()

    await finishLoading()
    expect(isOpen()).toBe(false)

    appStore.showRawBreakingNotice = false
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
