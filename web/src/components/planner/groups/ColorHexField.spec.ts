import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ColorHexField from './ColorHexField.vue'

describe('ColorHexField', () => {
  const render = (modelValue = '#4caf50') => mount(ColorHexField, { props: { modelValue } })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the current colour without its hash, and follows it when it changes', async () => {
    const wrapper = render()
    const input = wrapper.find('input')
    expect(input.element.value).toBe('4CAF50')

    await wrapper.setProps({ modelValue: '#26a69a' })
    expect(input.element.value).toBe('26A69A')
  })

  it.each([
    ['ff8800', '#ff8800'],
    ['#AbCdEf', '#abcdef'],
    ['f80', '#ff8800'],
  ])('applies %s on Enter as %s', async (typed, expected) => {
    const wrapper = render()
    const input = wrapper.find('input')
    await input.setValue(typed)
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')).toEqual([[expected]])
  })

  it('puts the current colour back when something that is not a hex code is left in the box', async () => {
    const wrapper = render()
    const input = wrapper.find('input')
    await input.setValue('nope')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await input.trigger('blur')
    expect(input.element.value).toBe('4CAF50')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('does not re-apply the colour the group already has', async () => {
    const wrapper = render()
    await wrapper.find('input').trigger('blur')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('copies the current colour with its hash and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const wrapper = render()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('#4CAF50')
    expect(wrapper.find('button').attributes('aria-label')).toBe('Copied')
    vi.unstubAllGlobals()
  })
})
