import { describe, expect, it } from 'vitest'
import { createMaelsBigBoiPlan } from '@/utils/factory-setups/maels-big-boi-plan'
import { resolveFactoryIcon } from '@/utils/factory-icons'

// The MegaPlan is the plan the icon feature is demonstrated on, so a typo'd id showing the
// generic glyph would be invisible in review and obvious in a screenshot.
describe("Mael's MegaPlan icons", () => {
  const factories = createMaelsBigBoiPlan().getFactories()

  it('should give every factory an icon', () => {
    factories.forEach(factory => {
      expect(factory.icon, `${factory.name} has no icon`).toBeTruthy()
    })
  })

  it('should only use ids the registry knows', () => {
    factories.forEach(factory => {
      expect(resolveFactoryIcon(factory.icon).kind, `${factory.name}: ${factory.icon}`).not.toBe('default')
    })
  })

  // Two factories wearing the same icon is not wrong, but the whole point here is telling a
  // 36-factory plan apart at a glance.
  it('should not repeat an icon', () => {
    const used = factories.map(factory => factory.icon)

    expect(new Set(used).size).toBe(used.length)
  })
})
