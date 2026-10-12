import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SurveyBanner from './SurveyBanner.vue'
import vuetify from '@/plugins/vuetify'

const KEY = 'dismissed-survey-2026-10'

describe('SurveyBanner', () => {
  const render = () => mount(SurveyBanner, { global: { plugins: [vuetify] } })
  const banner = (wrapper: ReturnType<typeof render>) => wrapper.find('[data-testid="survey-banner"]')

  beforeEach(() => {
    localStorage.removeItem(KEY)
  })

  it('asks for feedback and links to the survey in a new tab', () => {
    const wrapper = render()
    expect(banner(wrapper).text()).toContain('Offer your feedback on Satisfactory Factories')
    const link = wrapper.find('[data-testid="survey-banner-link"]')
    expect(link.attributes('href')).toContain('docs.google.com/forms/d/e/1FAIpQLSf9iwJVXUp3m2ixLjnAfLwTgzEBgK14NShyko2nr6y7dDCJeQ')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
  })

  it('hides when closed and remembers it for this browser', async () => {
    const wrapper = render()
    await wrapper.find('.v-alert__close button').trigger('click')

    expect(banner(wrapper).exists()).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('true')
    expect(banner(render()).exists()).toBe(false)
  })
})
