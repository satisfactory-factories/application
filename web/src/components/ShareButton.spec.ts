import vuetify from '@/plugins/vuetify'
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ShareButton from './ShareButton.vue'

createTestingPinia()

describe('ShareButton', () => {
  it('should match snapshot', () => {
    const subject = mount(ShareButton, {
      global: {
        plugins: [vuetify, createTestingPinia()],
      },
    })

    expect(subject.html()).toMatchSnapshot()
  })
})
