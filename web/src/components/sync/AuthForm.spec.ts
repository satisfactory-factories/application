import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import AuthForm from './AuthForm.vue'
import vuetify from '@/plugins/vuetify'
import { useAuthStore } from '@/stores/auth-store'

describe('AuthForm', () => {
  let authStore: ReturnType<typeof useAuthStore>

  const render = (props: Record<string, unknown> = {}) => {
    const pinia = createTestingPinia({ createSpy: vi.fn })
    setActivePinia(pinia)
    authStore = useAuthStore()

    return mount(AuthForm, { global: { plugins: [vuetify, pinia] }, props })
  }

  type Form = ReturnType<typeof render>

  const fill = async (wrapper: Form, username: string, password: string) => {
    const fields = wrapper.findAll('input')
    await fields[0].setValue(username)
    await fields[1].setValue(password)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('opens on sign in', () => {
    const wrapper = render()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).toContain('Sign In')
    expect(wrapper.text()).not.toContain('do not use an email address')
  })

  it('swaps to register and back', async () => {
    const wrapper = render()

    await wrapper.find('[data-testid="show-register"]').trigger('click')
    expect(wrapper.text()).toContain('do not use an email address')

    await wrapper.find('[data-testid="show-login"]').trigger('click')
    expect(wrapper.text()).not.toContain('do not use an email address')
  })

  it('logs in and says so, once', async () => {
    const wrapper = render()
    vi.mocked(authStore.login).mockResolvedValue(true)

    await fill(wrapper, 'pioneer', 'ficsit')

    expect(authStore.login).toHaveBeenCalledWith('pioneer', 'ficsit')
    expect(wrapper.emitted('authenticated')).toHaveLength(1)
  })

  it('registers, which logs in too', async () => {
    const wrapper = render()
    vi.mocked(authStore.register).mockResolvedValue(true)
    await wrapper.find('[data-testid="show-register"]').trigger('click')

    await fill(wrapper, 'pioneer', 'ficsit')

    expect(authStore.register).toHaveBeenCalledWith('pioneer', 'ficsit')
    expect(wrapper.emitted('authenticated')).toHaveLength(1)
  })

  it('shows the refusal and stays put', async () => {
    const wrapper = render()
    vi.mocked(authStore.login).mockResolvedValue('Credentials incorrect. Please try again.')

    await fill(wrapper, 'pioneer', 'wrong')

    expect(wrapper.find('[data-testid="auth-error"]').text()).toContain('Credentials incorrect')
    expect(wrapper.emitted('authenticated')).toBeUndefined()
  })

  it('refuses an empty field without asking the server', async () => {
    const wrapper = render()

    await fill(wrapper, '', '')

    expect(authStore.login).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="auth-error"]').text()).toContain('Please fill in both fields')
  })

  it('shows a failure the host hit outside the form', () => {
    const wrapper = render({ error: 'The backend is currently offline. Please report this on Discord!' })

    expect(wrapper.find('[data-testid="auth-error"]').text()).toContain('backend is currently offline')
    expect(wrapper.html()).toContain('discord.gg')
  })

  it('takes the wording of the ask from whoever is asking', () => {
    expect(render({ intro: 'Sign in and your synced tab is made straight afterwards.' }).text())
      .toContain('Sign in and your synced tab is made straight afterwards.')
  })
})
