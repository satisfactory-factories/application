import { describe, expect, it } from 'vitest'
import { createMaelsBigBoiPlan } from '@/utils/factory-setups/maels-big-boi-plan'
import { resolveFactoryIcon } from '@/utils/factory-icons'

// The MegaPlan is the plan the icon feature is demonstrated on, so a typo'd id showing the
// generic glyph would be invisible in review and obvious in a screenshot. It is a verbatim
// export of a real save, so a factory may have no icon yet, and mines on the same resource
// share one; only the ids that are set are checked.
describe("Mael's MegaPlan icons", () => {
  const factories = createMaelsBigBoiPlan().getFactories()

  it('should give most factories an icon', () => {
    const withIcon = factories.filter(factory => factory.icon)

    expect(withIcon.length).toBeGreaterThan(factories.length / 2)
  })

  it('should only use ids the registry knows', () => {
    factories.filter(factory => factory.icon).forEach(factory => {
      expect(resolveFactoryIcon(factory.icon).kind, `${factory.name}: ${factory.icon}`).not.toBe('default')
    })
  })
})
