import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import UpdateAvailableToast from './UpdateAvailableToast.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import eventBus from '@/utils/eventBus'

// v-snackbar teleports into the body, same as the dialog.
const isShown = () => !!document.querySelector('.v-snackbar')
const toastText = () => document.querySelector('.v-snackbar')?.textContent ?? ''
const buttonNamed = (label: string) => [...document.querySelectorAll('.v-snackbar button')]
  .find(button => button.textContent?.trim() === label) as HTMLElement | undefined

describe('UpdateAvailableToast', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vuetifyRender(UpdateAvailableToast)
  })

  it('should stay hidden until a release is announced', () => {
    expect(isShown()).toBe(false)
  })

  it('should name the version that is now live', async () => {
    eventBus.emit('updateAvailable', { version: '0.6.1' })
    await nextTick()

    expect(isShown()).toBe(true)
    expect(toastText()).toContain('0.6.1')
  })

  // The blocking dialog is for a build the API refuses. This one is a nudge, so it must be
  // possible to carry on planning and ignore it.
  it('should be dismissible', async () => {
    eventBus.emit('updateAvailable', { version: '0.6.1' })
    await nextTick()

    expect(document.querySelector('.v-snackbar--active')).toBeTruthy()

    const close = document.querySelector('.v-snackbar .fa-times')?.closest('button') as HTMLElement
    expect(close).toBeTruthy()
    close.click()
    await nextTick()

    // The wrapper lingers for the leave transition; active is what "shown" actually means.
    expect(document.querySelector('.v-snackbar--active')).toBeFalsy()
  })

  it('should reload the page, and do nothing else, when asked', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })
    const localWork = JSON.stringify([{ name: 'a plan' }])
    localStorage.setItem('factoryTabs', localWork)

    eventBus.emit('updateAvailable', { version: '0.6.1' })
    await nextTick()
    buttonNamed('Reload')?.click()

    expect(reload).toHaveBeenCalled()
    expect(localStorage.getItem('factoryTabs')).toBe(localWork)
  })
})
