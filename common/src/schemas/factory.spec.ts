import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { CAPS } from '../caps'
import { makeFactory, makeFactoryTab } from '../testing/fixtures'
import type { Factory, FactoryTab } from '../types/factory'
import {
  factorySchema,
  factoryTabSchema,
  invitePasswordSchema,
  slugSchema,
} from './factory'

// Both directions: the schema output must be usable as a Factory, and a Factory must
// satisfy the schema's input. A field added to one and not the other fails the build.
type SchemaFactory = z.infer<typeof factorySchema>
type SchemaTab = z.infer<typeof factoryTabSchema>
const _factoryOut: Factory = {} as SchemaFactory
const _factoryIn: SchemaFactory = {} as Factory
const _tabOut: FactoryTab = {} as SchemaTab
const _tabIn: SchemaTab = {} as FactoryTab
void [_factoryOut, _factoryIn, _tabOut, _tabIn]

describe('factorySchema', () => {
  it('accepts a fully populated factory', () => {
    expect(factorySchema.safeParse(makeFactory()).success).toBe(true)
  })

  it('strips unknown keys', () => {
    const parsed = factorySchema.parse({ ...makeFactory(), somethingElse: 'drop me' })
    expect('somethingElse' in parsed).toBe(false)
  })

  it('rejects a missing required field', () => {
    const factory = makeFactory() as Partial<Factory>
    delete factory.dataVersion
    expect(factorySchema.safeParse(factory).success).toBe(false)
  })

  it('rejects NaN and Infinity', () => {
    expect(factorySchema.safeParse(makeFactory({ displayOrder: NaN })).success).toBe(false)
    expect(factorySchema.safeParse(makeFactory({ displayOrder: Infinity })).success).toBe(false)
  })

  it('rejects a name over the cap rather than truncating it', () => {
    expect(factorySchema.safeParse(makeFactory({ name: 'x'.repeat(201) })).success).toBe(false)
  })

  it('rejects notes over the cap', () => {
    expect(factorySchema.safeParse(makeFactory({ notes: 'x'.repeat(1001) })).success).toBe(false)
  })

  it('rejects more tasks than the cap', () => {
    const tasks = Array.from({ length: CAPS.tasks + 1 }, () => ({ title: 't', completed: false }))
    expect(factorySchema.safeParse(makeFactory({ tasks })).success).toBe(false)
  })

  it('rejects a group colour over 32 characters', () => {
    const group = { id: 'g-1', name: 'Group', color: 'c'.repeat(33), order: 0 }
    expect(factorySchema.safeParse(makeFactory({ group })).success).toBe(false)
  })

  it('rejects any other string over 10k', () => {
    expect(factorySchema.safeParse(makeFactory({ icon: 'i'.repeat(CAPS.string + 1) })).success).toBe(false)
  })

  it('rejects a bad enum value', () => {
    const factory = makeFactory()
    factory.products[0].buildingGroups[0].type = 'Nonsense' as never
    expect(factorySchema.safeParse(factory).success).toBe(false)
  })

  it('keeps the optional fields optional', () => {
    const factory = makeFactory()
    delete factory.icon
    delete factory.group
    expect(factorySchema.safeParse(factory).success).toBe(true)
  })

  // A factory the user added but never calculated is persisted with `power: {}`, and
  // plans in that shape are already in browsers. Rejecting one cost an op per added
  // factory and made adoption fail outright, so the totals are filled instead.
  describe('an uncalculated factory', () => {
    it('accepts an empty power object and zeroes the totals', () => {
      const parsed = factorySchema.parse(makeFactory({ power: {} as Factory['power'] }))
      expect(parsed.power).toEqual({ consumed: 0, produced: 0, difference: 0 })
    })

    it('accepts a missing power object entirely', () => {
      const factory = makeFactory() as Partial<Factory>
      delete factory.power
      const parsed = factorySchema.parse(factory)
      expect(parsed.power).toEqual({ consumed: 0, produced: 0, difference: 0 })
    })

    it('leaves the totals of a calculated factory alone', () => {
      expect(factorySchema.parse(makeFactory()).power)
        .toEqual({ consumed: 4, produced: 0, difference: -4 })
    })

    it('still rejects a non-numeric total', () => {
      const power = { consumed: 'lots' } as unknown as Factory['power']
      expect(factorySchema.safeParse(makeFactory({ power })).success).toBe(false)
    })

    it('parses inside a tab, so adoption and snapshot links take it too', () => {
      const factories = [makeFactory({ power: {} as Factory['power'] })]
      const parsed = factoryTabSchema.parse(makeFactoryTab({ factories }))
      expect(parsed.factories[0].power).toEqual({ consumed: 0, produced: 0, difference: 0 })
    })
  })
})

describe('factoryTabSchema', () => {
  it('accepts a tab', () => {
    expect(factoryTabSchema.safeParse(makeFactoryTab()).success).toBe(true)
  })

  it('rejects more factories than the per-room cap', () => {
    const factories = Array.from({ length: CAPS.factoriesPerRoom + 1 }, (_, index) =>
      makeFactory({ id: index }))
    expect(factoryTabSchema.safeParse(makeFactoryTab({ factories })).success).toBe(false)
  })

  it('accepts exactly the per-room cap', () => {
    const factories = Array.from({ length: CAPS.factoriesPerRoom }, (_, index) =>
      makeFactory({ id: index }))
    expect(factoryTabSchema.safeParse(makeFactoryTab({ factories })).success).toBe(true)
  })

  it('rejects an empty id', () => {
    expect(factoryTabSchema.safeParse(makeFactoryTab({ id: '' })).success).toBe(false)
  })
})

describe('slugSchema', () => {
  it('lowercases before matching', () => {
    expect(slugSchema.parse('Three-Word-Slug')).toBe('three-word-slug')
  })

  it.each(['under_score', 'has space', 'punctuation!', '', 'a'.repeat(101)])(
    'rejects %j', value => {
      expect(slugSchema.safeParse(value).success).toBe(false)
    })

  it('accepts 100 characters', () => {
    expect(slugSchema.safeParse('a'.repeat(100)).success).toBe(true)
  })
})

describe('invitePasswordSchema', () => {
  it.each([
    { length: 1, accepted: true },
    { length: 100, accepted: true },
    { length: 0, accepted: false },
    { length: 101, accepted: false },
  ])('a $length character password is accepted: $accepted', ({ length, accepted }) => {
    expect(invitePasswordSchema.safeParse('p'.repeat(length)).success).toBe(accepted)
  })
})
