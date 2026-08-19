import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/vue'
import FactoryIconDisplay from './FactoryIconDisplay.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'

const renderIcon = (props: Record<string, unknown>) =>
  vuetifyRender(FactoryIconDisplay, { props })

describe('FactoryIconDisplay', () => {
  it('renders a game asset for an image icon', () => {
    const { container } = renderIcon({ icon: 'iron-ingot', size: 32 })

    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/assets/game/item/iron-ingot_64.png')
    expect(img?.getAttribute('alt')).toBe('Iron Ingot')
  })

  it('uses the large asset above 64px', () => {
    const { container } = renderIcon({ icon: 'smelter', size: 96 })

    expect(container.querySelector('img')?.getAttribute('src'))
      .toBe('/assets/game/building/smeltermk1_256.png')
  })

  it('renders the character for an emoji icon', () => {
    const { getByText } = renderIcon({ icon: 'sq-blue' })
    expect(getByText('🟦')).toBeTruthy()
  })

  it.each([
    ['no icon', undefined],
    ['an unknown icon', 'not-a-real-icon'],
  ])('falls back to the industry glyph with %s', (_label, icon) => {
    const { container } = renderIcon({ icon })

    expect(container.querySelector('.fa-industry')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('sizes the box so every variant occupies the same square', () => {
    const image = renderIcon({ icon: 'iron-ingot', size: 20 })
    const emoji = renderIcon({ icon: 'sq-blue', size: 20 })

    for (const { container } of [image, emoji]) {
      const box = container.querySelector<HTMLElement>('.factory-icon')
      expect(box?.style.width).toBe('20px')
      expect(box?.style.height).toBe('20px')
    }
  })

  it('is not a button unless it is clickable', () => {
    const { container } = renderIcon({ icon: 'iron-ingot' })
    expect(container.querySelector('button')).toBeNull()
  })

  it('emits click when clickable', async () => {
    const { container, emitted } = renderIcon({ icon: 'iron-ingot', clickable: true })

    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    expect(button?.classList.contains('clickable')).toBe(true)

    await fireEvent.click(button!)
    expect(emitted().click).toHaveLength(1)
  })

  // The hint is a HoverTooltip rather than a native `title`, so the whole app's tooltips look
  // alike; `aria-label` carries the name the attribute used to give the button.
  it('names the current icon in the clickable hint so the affordance is discoverable', () => {
    const { container } = renderIcon({ icon: 'sq-blue', clickable: true })
    const button = container.querySelector('button')

    expect(button?.getAttribute('data-hover-tooltip')).toContain('Blue square')
    expect(button?.getAttribute('aria-label')).toContain('Blue square')
    expect(button?.getAttribute('title')).toBeNull()
  })

  it('prefers an explicit title', () => {
    const { container } = renderIcon({ icon: 'sq-blue', clickable: true, title: 'Pick an icon' })

    expect(container.querySelector('button')?.getAttribute('data-hover-tooltip')).toBe('Pick an icon')
  })

  // FontAwesome's SVG replacement detaches the <i> it converts, so swapping a bare <i> for
  // another element crashes Vue's patch on a null parent. Each variant sits in a wrapper Vue
  // owns instead — this asserts the swap in both directions.
  it.each([
    ['default to image', undefined, 'iron-ingot'],
    ['image to default', 'iron-ingot', undefined],
    ['default to emoji', undefined, 'sq-blue'],
    ['emoji to default', 'sq-blue', undefined],
    ['image to emoji', 'iron-ingot', 'sq-blue'],
  ])('swaps cleanly from %s', async (_label, from, to) => {
    const { container, rerender } = renderIcon({ icon: from })
    await rerender({ icon: to })

    const hasImage = !!container.querySelector('img')
    const hasGlyph = !!container.querySelector('.fa-industry')
    const hasEmoji = !!container.querySelector('.factory-icon-emoji')

    // Exactly one variant, and no stale node left behind from the one before it.
    expect([hasImage, hasGlyph, hasEmoji].filter(Boolean)).toHaveLength(1)
    expect(container.querySelectorAll('.factory-icon-variant')).toHaveLength(1)

    if (to === 'iron-ingot') expect(hasImage).toBe(true)
    if (to === 'sq-blue') expect(hasEmoji).toBe(true)
    if (to === undefined) expect(hasGlyph).toBe(true)
  })

  it('falls back to a sane size when handed nonsense', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = renderIcon({ icon: 'sq-blue', size: 'not-a-number' })

    expect(container.querySelector<HTMLElement>('.factory-icon')?.style.width).toBe('24px')
  })
})
