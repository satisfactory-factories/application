import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import SurveyBanner from './SurveyBanner.vue'
import vuetify from '@/plugins/vuetify'
import { useAuthStore } from '@/stores/auth-store'

const DISMISSED = 'dismissed-survey-2026-10'
const VISITED = 'visitedBefore'

describe('SurveyBanner', () => {
  const render = ({ loggedIn = false } = {}) => {
    const pinia = createTestingPinia({ createSpy: vi.fn })
    const auth = useAuthStore(pinia)
    // isLoggedIn is derived from these two.
    auth.token = loggedIn ? 'token' : ''
    auth.loggedInUser = loggedIn ? 'pioneer' : ''
    return mount(SurveyBanner, { global: { plugins: [vuetify, pinia] } })
  }
  const banner = (wrapper: ReturnType<typeof render>) => wrapper.find('[data-testid="survey-banner"]')

  beforeEach(() => {
    localStorage.clear()
  })

  it('stays hidden on the first visit, and shows on the next', () => {
    expect(banner(render()).exists()).toBe(false)
    expect(localStorage.getItem(VISITED)).toBe('true')
    expect(banner(render()).exists()).toBe(true)
  })

  it('shows on the first load since shipping to anyone who already closed the introduction', () => {
    localStorage.setItem('dismissed-introduction', 'true')
    expect(banner(render()).exists()).toBe(true)
  })

  it('shows to anyone signed in, even on a first visit to this browser', () => {
    expect(banner(render({ loggedIn: true })).exists()).toBe(true)
  })

  it('asks for feedback and links to the survey in a new tab', () => {
    localStorage.setItem(VISITED, 'true')
    const wrapper = render()
    expect(banner(wrapper).text()).toContain('Offer your feedback on Satisfactory Factories')
    const link = wrapper.find('[data-testid="survey-banner-link"]')
    expect(link.attributes('href')).toContain('docs.google.com/forms/d/e/1FAIpQLSf9iwJVXUp3m2ixLjnAfLwTgzEBgK14NShyko2nr6y7dDCJeQ')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
  })

  it('hides when closed and remembers it for this browser', async () => {
    localStorage.setItem(VISITED, 'true')
    const wrapper = render({ loggedIn: true })
    await wrapper.find('.v-alert__close button').trigger('click')

    expect(banner(wrapper).exists()).toBe(false)
    expect(localStorage.getItem(DISMISSED)).toBe('true')
    expect(banner(render({ loggedIn: true })).exists()).toBe(false)
  })
})
