import { describe, expect, it } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import {
  calculateFactories,
  calculateFactory,
  generateFactoryId,
  newFactory,
} from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { addInputToFactory, deleteInputPair } from '@/utils/factory-management/inputs'
import { removeFactoryDependants } from '@/utils/factory-management/dependencies'
import { findDependencyChainViolations } from '@/utils/factory-management/dependency-integrity'
import { gameData } from '@/utils/gameData'
import { complexDemoPlan } from '@/utils/factory-setups/complex-demo-plan'

// Deterministic PRNG so a failure names a seed that reproduces it exactly.
const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Randomly walks a real plan through the edits the planner UI can make, checking after
// every single one that no factory is left advertising an export nobody imports. The
// individual cases in dependency-integrity.spec.ts cover the paths we know about; this
// covers the orderings and interleavings we haven't thought of.
describe('export / import chain fuzz', () => {
  const runFuzz = (seed: number, steps: number): number => {
    const rand = mulberry32(seed)
    const pick = <T>(items: T[]): T | undefined => items.length ? items[Math.floor(rand() * items.length)] : undefined

    const factories = complexDemoPlan().getFactories()
    calculateFactories(factories, gameData)

    const log: string[] = []

    for (let step = 0; step < steps; step++) {
      const factory = pick(factories)
      if (!factory) break

      switch (Math.floor(rand() * 8)) {
        case 0: { // Delete an import
          const input = pick(factory.inputs)
          if (!input) break
          log.push(`delete import ${input.outputPart} on ${factory.name}`)
          deleteInputPair(factory, input, factories, gameData)
          break
        }
        case 1: { // Change an import quantity
          const input = pick(factory.inputs)
          if (!input) break
          input.amount = Math.floor(rand() * 500) + 1
          log.push(`set import ${input.outputPart} on ${factory.name} to ${input.amount}`)
          calculateFactory(factory, factories, gameData)
          break
        }
        case 2: { // Delete a product
          const product = pick(factory.products)
          if (!product) break
          log.push(`delete product ${product.id} on ${factory.name}`)
          factory.products = factory.products.filter(item => item !== product)
          calculateFactory(factory, factories, gameData)
          break
        }
        case 3: { // Delete a factory, the way Planner.vue does
          if (factories.length <= 2) break
          log.push(`delete factory ${factory.name}`)
          removeFactoryDependants(factory, factories)
          factories.splice(factories.indexOf(factory), 1)
          calculateFactories(factories, gameData)
          break
        }
        case 4: { // Add an import from another factory that exports something
          const provider = pick(factories.filter(fac => fac.id !== factory.id))
          if (!provider) break
          const part = pick(Object.keys(provider.parts).filter(key => provider.parts[key].exportable))
          if (!part) break
          if (factory.inputs.some(input => input.factoryId === provider.id && input.outputPart === part)) break
          log.push(`add import ${part} from ${provider.name} to ${factory.name}`)
          addInputToFactory(factory, { factoryId: provider.id, outputPart: part, amount: 100 })
          calculateFactory(factory, factories, gameData)
          break
        }
        case 5: { // Change a product quantity
          const product = pick(factory.products)
          if (!product) break
          product.amount = Math.floor(rand() * 1000) + 1
          log.push(`set product ${product.id} on ${factory.name} to ${product.amount}`)
          calculateFactory(factory, factories, gameData)
          break
        }
        case 6: { // Add a new factory producing something everyone wants
          const created = newFactory(`Fuzz ${step}`, factories.length, generateFactoryId(factories))
          addProductToFactory(created, { id: 'IronIngot', amount: 500, recipe: 'IngotIron' })
          factories.push(created)
          log.push(`add factory ${created.name}`)
          calculateFactories(factories, gameData)
          break
        }
        case 7: { // Copy a factory, the way Planner.vue does
          const copy: Factory = {
            ...structuredClone(factory),
            id: generateFactoryId(factories),
            name: `${factory.name} (copy)`,
            displayOrder: factories.length,
            dependencies: { requests: {}, metrics: {} },
          }
          factories.push(copy)
          log.push(`copy factory ${factory.name}`)
          calculateFactories(factories, gameData)
          break
        }
      }

      const violations = findDependencyChainViolations(factories)
      if (violations.length) {
        throw new Error(
          `Integrity broken at step ${step} (seed ${seed}):\n${violations.join('\n')}\n\nActions:\n${log.join('\n')}`
        )
      }
    }

    return log.length
  }

  Array.from({ length: 12 }, (_, index) => index + 1).forEach(seed => {
    it(`keeps exports and imports in lockstep across random edits (seed ${seed})`, () => {
      let applied = 0
      expect(() => { applied = runFuzz(seed, 60) }).not.toThrow()
      // Guards against a walk that silently no-ops its way to a pass.
      expect(applied).toBeGreaterThan(20)
    })
  })
})
