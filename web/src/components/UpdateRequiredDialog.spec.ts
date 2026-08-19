import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import UpdateRequiredDialog from './UpdateRequiredDialog.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import eventBus from '@/utils/eventBus'
import { config } from '@/config/config'

// v-dialog teleports into the body, so "is it open" is the overlay's own state.
const isOpen = () => !!document.querySelector('.v-overlay--active')
const dialogText = () => document.querySelector('.v-card')?.textContent ?? ''

describe('UpdateRequiredDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vuetifyRender(UpdateRequiredDialog)
  })

  it('should stay shut until the API refuses this client', () => {
    expect(isOpen()).toBe(false)
  })

  it('should block the page when the client is outdated', async () => {
    eventBus.emit('clientOutdated', { minimumVersion: '0.7.0' })
    await nextTick()

    expect(isOpen()).toBe(true)
    expect(dialogText()).toContain('0.7.0')
    expect(dialogText()).toContain(config.appVersion)
  })

  // The outage path tells people to report to Discord. A required reload must not read that way,
  // and must not suggest the user's work is at risk.
  it('should reassure rather than sound like an outage', async () => {
    eventBus.emit('clientOutdated', { minimumVersion: '0.7.0' })
    await nextTick()

    expect(dialogText()).toContain('Your plan is safe')
    expect(dialogText()).not.toContain('Discord')
  })

  it('should reload the page, and do nothing else, when asked', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
    })
    const localWork = '{"tab":"local work"}'
    localStorage.setItem('factoryTabs', localWork)

    eventBus.emit('clientOutdated', { minimumVersion: '0.7.0' })
    await nextTick()
    ;([...document.querySelectorAll('.v-card-actions button')].at(-1) as HTMLElement)?.click()
    await nextTick()

    expect(reload).toHaveBeenCalled()
    // The plan is the only copy there is. Reloading is the fix; clearing anything is not.
    expect(localStorage.getItem('factoryTabs')).toBe(localWork)
  })
})
