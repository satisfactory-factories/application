import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Factory } from '@/interfaces/planner/FactoryInterface'
import { calculateFactory, newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'
import { validateFactories } from '@/utils/factory-management/validation'
import { gameData } from '@/utils/gameData'
import eventBus from '@/utils/eventBus'

/**
 * `factoryEdited` is the statement that the user acted on a factory, and a rebase overlays
 * exactly those factories over the server's copy. Anything else reaching the same entry
 * point (load-time repair above all) must stay silent or it claims records the user never
 * touched and overwrites a collaborator's newer work.
 */
describe('calculateFactory intent', () => {
  let factory: Factory
  let factories: Factory[]
  let emitted: string[]

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    factory = newFactory('Iron Ingots', 0, 1)
    addProductToFactory(factory, { id: 'IronIngot', amount: 100, recipe: 'IngotIron' })
    factories = [factory]

    emitted = []
    vi.spyOn(eventBus, 'emit').mockImplementation((event: string) => {
      emitted.push(event)
    })
  })

  it('announces a user edit as intent', () => {
    calculateFactory(factory, factories, gameData, { intent: 'userEdit' })

    expect(emitted).toContain('factoryUpdated')
    expect(emitted).toContain('factoryEdited')
  })

  it('announces a derived recalculation as payload only', () => {
    calculateFactory(factory, factories, gameData, { intent: 'derived' })

    expect(emitted).toContain('factoryUpdated')
    expect(emitted).not.toContain('factoryEdited')
  })

  // A call site that forgets to state intent loses the user's claim on that factory, which
  // the user can see and redo. Claiming one they never made is silent and costs a peer's work.
  it('treats an unstated intent as derived', () => {
    calculateFactory(factory, factories, gameData)

    expect(emitted).not.toContain('factoryEdited')
  })

  it('carries the other calculation modes through unchanged', () => {
    calculateFactory(factory, factories, gameData, { intent: 'userEdit', origin: 'recalculate' })

    expect(factory.products[0].amount).toBe(100)
    expect(emitted).toContain('factoryEdited')
  })

  /**
   * The bug this file exists for: repairing a malformed product on load recalculates the
   * factory, and that used to announce intent. Opening a shared plan that needed repair
   * therefore claimed factories nobody had edited.
   */
  it('does not claim a factory the loader repaired', () => {
    factory.products[0].amount = 0

    const repairs = validateFactories(factories, gameData)

    expect(repairs.some(repair => repair.summary.includes('cannot be planned against'))).toBe(true)
    expect(factory.products[0].amount).toBe(0.1)
    expect(emitted).not.toContain('factoryEdited')
  })
})

/**
 * The default is deliberately the silent one, so a call site that forgets to state intent
 * fails safe. That makes forgetting invisible at runtime, so it is caught here instead:
 * every production call must name its intent, and adding one without doing so fails.
 */
describe('every calculateFactory call site states its intent', () => {
  const srcRoot = path.resolve(__dirname, '../..')
  const CALL = /(?<![A-Za-z0-9_$])calculateFactory\(/g

  const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(full)
      if (entry.name.endsWith('.spec.ts')) return []
      return /\.(ts|vue)$/.test(entry.name) ? [full] : []
    })

  /** The call's own argument list, from the opening bracket to the one that closes it. */
  const argumentsOf = (source: string, openIndex: number): string => {
    let depth = 0
    for (let index = openIndex; index < source.length; index++) {
      if (source[index] === '(') depth++
      if (source[index] === ')' && --depth === 0) return source.slice(openIndex + 1, index)
    }
    return source.slice(openIndex)
  }

  it('names userEdit or derived at every call', () => {
    const missing: string[] = []

    for (const file of sourceFiles(srcRoot)) {
      const source = fs.readFileSync(file, 'utf-8')
      for (const match of source.matchAll(CALL)) {
        const open = match.index + match[0].length - 1
        if (/intent:\s*'(userEdit|derived)'/.test(argumentsOf(source, open))) continue
        const line = source.slice(0, match.index).split('\n').length
        missing.push(`${path.relative(srcRoot, file)}:${line}`)
      }
    }

    expect(missing).toEqual([])
  })

  // The scan is worthless if it silently matches nothing, which a rename would cause.
  it('actually found the call sites', () => {
    const calls = sourceFiles(srcRoot)
      .reduce((total, file) => total + [...fs.readFileSync(file, 'utf-8').matchAll(CALL)].length, 0)

    expect(calls).toBeGreaterThanOrEqual(4)
  })
})
