import { beforeEach, describe, expect, it } from 'vitest'
import type { Factory } from 'common'
import {
  conflictProductRows,
  describeClash,
  differsOutsideProducts,
  fingerprint,
} from '@/sync/offline-conflict'
import { newFactory } from '@/utils/factory-management/factory'
import { addProductToFactory } from '@/utils/factory-management/products'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('offline conflict evidence', () => {
  let live: Factory
  let mine: Factory

  beforeEach(() => {
    const base = newFactory('Smelters', 0, 1)
    addProductToFactory(base, { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
    live = clone(base)
    mine = clone(base)
  })

  describe('product rows', () => {
    it('shows both amounts when one product moved', () => {
      live.products[0].amount = 60
      mine.products[0].amount = 45

      expect(conflictProductRows(live, mine)).toEqual([
        { itemId: 'IronIngot', live: 60, mine: 45, recipeChanged: false },
      ])
    })

    it('says so when the recipe moved as well', () => {
      live.products[0].recipe = 'Alternate_PureIronIngot'
      mine.products[0].amount = 45

      expect(conflictProductRows(live, mine)[0].recipeChanged).toBe(true)
    })

    it('reads a product only the live plan has as removed here', () => {
      addProductToFactory(live, { id: 'CopperIngot', amount: 20, recipe: 'IngotCopper' })

      expect(conflictProductRows(live, mine)).toEqual([
        { itemId: 'CopperIngot', live: 20, mine: null, recipeChanged: false },
      ])
    })

    it('reads a product only this device has as none live', () => {
      addProductToFactory(mine, { id: 'CopperIngot', amount: 20, recipe: 'IngotCopper' })

      expect(conflictProductRows(live, mine)).toEqual([
        { itemId: 'CopperIngot', live: null, mine: 20, recipeChanged: false },
      ])
    })

    it('leaves out the products the two versions agree on', () => {
      expect(conflictProductRows(live, mine)).toEqual([])
    })

    // "Add Product" hands the user a row with no item, and a row with no item is
    // nothing anyone could compare.
    it('ignores a blank product row', () => {
      addProductToFactory(mine, { id: '', amount: 1 })

      expect(conflictProductRows(live, mine)).toEqual([])
    })
  })

  describe('changes the product rows cannot show', () => {
    it('reports an authored field the two versions disagree about', () => {
      mine.notes = 'Needs a second smelter'

      expect(differsOutsideProducts(live, mine)).toBe(true)
      expect(describeClash(1, live, mine)?.otherChanges).toBe(true)
    })

    // Everything the calculation derives moves whenever a peer edits a factory this one
    // imports from, and nobody can decide anything about that.
    it('ignores figures the calculation derives', () => {
      mine.parts = { IronIngot: { amountRequired: 5 } as never }

      expect(differsOutsideProducts(live, mine)).toBe(false)
      expect(describeClash(1, live, mine)).toBeNull()
    })
  })

  describe('the section a clash earns', () => {
    it('is nothing at all when the two versions are identical', () => {
      expect(describeClash(1, live, mine)).toBeNull()
    })

    it('names the factory as this device knows it', () => {
      live.name = 'Foundries'
      mine.name = 'Smelters'
      mine.products[0].amount = 45

      expect(describeClash(1, live, mine)?.name).toBe('Smelters')
    })

    it('records a factory the live plan no longer holds, with this device\'s products', () => {
      const clash = describeClash(1, null, mine)

      expect(clash?.liveDeleted).toBe(true)
      expect(clash?.mineDeleted).toBe(false)
      expect(clash?.products).toEqual([
        { itemId: 'IronIngot', live: null, mine: 30, recipeChanged: false },
      ])
    })

    it('records a factory this device removed, with the live products', () => {
      const clash = describeClash(1, live, null)

      expect(clash?.mineDeleted).toBe(true)
      expect(clash?.products).toEqual([
        { itemId: 'IronIngot', live: 30, mine: null, recipeChanged: false },
      ])
    })

    it('is nothing when neither side holds the factory any more', () => {
      expect(describeClash(1, null, null)).toBeNull()
    })
  })

  describe('baseline fingerprints', () => {
    it('is stable for the same record', () => {
      expect(fingerprint(JSON.stringify(live))).toBe(fingerprint(JSON.stringify(clone(live))))
    })

    it('moves when the record does', () => {
      const before = fingerprint(JSON.stringify(live))
      live.products[0].amount = 31

      expect(fingerprint(JSON.stringify(live))).not.toBe(before)
    })
  })
})
