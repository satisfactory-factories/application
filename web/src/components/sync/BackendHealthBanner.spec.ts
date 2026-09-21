import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import BackendHealthBanner from './BackendHealthBanner.vue'
import vuetify from '@/plugins/vuetify'
import { HEALTH_RETRY_ATTEMPTS, useBackendHealthStore } from '@/stores/backend-health-store'

describe('BackendHealthBanner', () => {
  let health: ReturnType<typeof useBackendHealthStore>

  const render = () => {
    const pinia = createTestingPinia({ createSpy: vi.fn })
    setActivePinia(pinia)
    health = useBackendHealthStore()
    return mount(BackendHealthBanner, { global: { plugins: [vuetify, pinia] } })
  }

  const banner = (wrapper: ReturnType<typeof render>) =>
    wrapper.find('[data-testid="backend-health-banner"]')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stays out of the way while the backend is well', () => {
    expect(banner(render()).exists()).toBe(false)
  })

  it('says what is wrong and where to report it', async () => {
    const wrapper = render()
    health.unhealthy = true
    await nextTick()

    expect(banner(wrapper).text()).toContain('SF\'s backend is experiencing issues')
    expect(banner(wrapper).text()).toContain('Please report this immediately on Discord')
    expect(banner(wrapper).text()).toContain('unavailable until it is back')
    expect(wrapper.find('[data-testid="backend-health-discord"]').attributes('href'))
      .toBe('https://discord.gg/vcFsjcWAFv')
  })

  it('says it is reconnecting, and does not send anyone to Discord yet', async () => {
    const wrapper = render()
    health.unhealthy = true
    health.failures = 2
    await nextTick()

    const text = banner(wrapper).text()
    expect(text).toContain(
      `Reconnecting to SF's backend servers, attempt 2 of ${HEALTH_RETRY_ATTEMPTS}`,
    )
    expect(text).toContain('an update is going out')
    expect(text).not.toContain('Discord')
    expect(wrapper.find('[data-testid="backend-health-retrying"]').exists()).toBe(true)
  })

  it('hardens into the outage notice once the quick retries are spent', async () => {
    const wrapper = render()
    health.unhealthy = true
    health.failures = HEALTH_RETRY_ATTEMPTS + 1
    await nextTick()

    expect(wrapper.find('[data-testid="backend-health-retrying"]').exists()).toBe(false)
    expect(banner(wrapper).text()).toContain('Please report this immediately on Discord')
  })

  it('goes away the moment the backend answers again', async () => {
    const wrapper = render()
    health.unhealthy = true
    await nextTick()
    expect(banner(wrapper).exists()).toBe(true)

    health.unhealthy = false
    await nextTick()

    expect(banner(wrapper).exists()).toBe(false)
  })
})
