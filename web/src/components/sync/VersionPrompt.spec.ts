import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import VersionPrompt from './VersionPrompt.vue'
import vuetify from '@/plugins/vuetify'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import eventBus from '@/utils/eventBus'

const reload = vi.fn()

describe('VersionPrompt', () => {
  let roomSync: ReturnType<typeof useRoomSyncStore>

  const render = () => {
    const pinia = createTestingPinia({ createSpy: vi.fn })
    setActivePinia(pinia)
    roomSync = useRoomSyncStore()
    return mount(VersionPrompt, { global: { plugins: [vuetify, pinia] } })
  }

  const visible = (wrapper: ReturnType<typeof render>) =>
    wrapper.find('[data-testid="version-prompt"]').exists()

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })
  })

  it('stays out of the way until the gate fires', () => {
    expect(visible(render())).toBe(false)
  })

  it('appears on a 426 from any REST call', async () => {
    const wrapper = render()

    eventBus.emit('versionMismatch', { source: 'rest' })
    await nextTick()

    expect(visible(wrapper)).toBe(true)
    expect(wrapper.text()).toContain('A new version is available')
  })

  it('appears when the socket is closed 4426', async () => {
    const wrapper = render()

    roomSync.connection = 'version_mismatch'
    await nextTick()

    expect(visible(wrapper)).toBe(true)
  })

  it('is already showing when the socket was rejected before it mounted', () => {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: { roomSync: { connection: 'version_mismatch' } },
    })
    setActivePinia(pinia)

    const wrapper = mount(VersionPrompt, { global: { plugins: [vuetify, pinia] } })

    expect(visible(wrapper)).toBe(true)
  })

  it('cannot be dismissed, only refreshed', async () => {
    const wrapper = render()
    eventBus.emit('versionMismatch', { source: 'ws' })
    await nextTick()

    await wrapper.find('[data-testid="version-refresh"]').trigger('click')

    expect(reload).toHaveBeenCalled()
    expect(visible(wrapper)).toBe(true)
  })

  it('stops listening once it is gone', async () => {
    const wrapper = render()
    wrapper.unmount()

    // Nothing should still be holding a handler that writes into a dead component.
    expect(() => eventBus.emit('versionMismatch', { source: 'rest' })).not.toThrow()
  })
})
