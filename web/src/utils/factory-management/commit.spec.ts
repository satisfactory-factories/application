import { beforeEach, describe, expect, it } from 'vitest'
import { reactive, watch } from 'vue'
import { applyDiff } from '@/utils/factory-management/commit'

describe('applyDiff', () => {
  describe('primitives and keys', () => {
    it('should write changed primitive values and count them', () => {
      const target = { a: 1, b: 'x', c: true }
      const writes = applyDiff(target, { a: 2, b: 'x', c: false })
      expect(target).toEqual({ a: 2, b: 'x', c: false })
      expect(writes).toBe(2)
    })

    it('should perform zero writes when structures are identical', () => {
      const target = { a: 1, nested: { b: [1, 2, { c: 'x' }] } }
      const source = structuredClone(target)
      expect(applyDiff(target, source)).toBe(0)
    })

    it('should add keys missing from the target', () => {
      const target: Record<string, unknown> = { a: 1 }
      applyDiff(target, { a: 1, b: { c: 2 } })
      expect(target).toEqual({ a: 1, b: { c: 2 } })
    })

    it('should delete keys missing from the source', () => {
      const target: Record<string, unknown> = { a: 1, b: 2 }
      applyDiff(target, { a: 1 })
      expect(target).toEqual({ a: 1 })
      expect('b' in target).toBe(false)
    })

    it('should treat NaN as stable and not rewrite it', () => {
      const target = { a: NaN }
      expect(applyDiff(target, { a: NaN })).toBe(0)
    })

    it('should handle null transitions in both directions', () => {
      const target: Record<string, unknown> = { a: null, b: { x: 1 } }
      applyDiff(target, { a: { x: 1 }, b: null })
      expect(target).toEqual({ a: { x: 1 }, b: null })
    })
  })

  describe('identity preservation', () => {
    it('should keep the identity of objects that exist in both trees', () => {
      const nested = { amount: 5, satisfied: false }
      const target = { parts: { IronIngot: nested } }
      applyDiff(target, { parts: { IronIngot: { amount: 10, satisfied: true } } })
      expect(target.parts.IronIngot).toBe(nested)
      expect(nested.amount).toBe(10)
      expect(nested.satisfied).toBe(true)
    })

    it('should keep the identity of arrays and their surviving elements', () => {
      const first = { id: 1, amount: 10 }
      const arr = [first, { id: 2, amount: 20 }]
      const target = { inputs: arr }
      applyDiff(target, { inputs: [{ id: 1, amount: 99 }] })
      expect(target.inputs).toBe(arr)
      expect(target.inputs[0]).toBe(first)
      expect(target.inputs).toEqual([{ id: 1, amount: 99 }])
    })

    it('should grow arrays with detached copies of new elements', () => {
      const source = { inputs: [{ id: 1 }] }
      const target: { inputs: { id: number }[] } = { inputs: [] }
      applyDiff(target, source)
      expect(target.inputs).toEqual([{ id: 1 }])
      // The committed element must not share identity with the source tree.
      expect(target.inputs[0]).not.toBe(source.inputs[0])
    })

    it('should replace a value wholesale when its shape changes', () => {
      const target: Record<string, unknown> = { a: [1, 2], b: { x: 1 }, c: 5 }
      applyDiff(target, { a: { y: 1 }, b: [3], c: 'now a string' })
      expect(target).toEqual({ a: { y: 1 }, b: [3], c: 'now a string' })
    })
  })

  describe('reactive targets', () => {
    let target: { parts: Record<string, { amount: number }>, list: number[] }
    let fires: number

    beforeEach(() => {
      target = reactive({ parts: { IronIngot: { amount: 5 } }, list: [1, 2, 3] })
      fires = 0
      watch(() => target, () => {
        fires++
      }, { deep: true, flush: 'sync' })
    })

    it('should not trigger watchers when nothing changed', () => {
      applyDiff(target, { parts: { IronIngot: { amount: 5 } }, list: [1, 2, 3] })
      expect(fires).toBe(0)
    })

    it('should trigger watchers only for the values that changed', () => {
      applyDiff(target, { parts: { IronIngot: { amount: 6 } }, list: [1, 2, 3] })
      expect(target.parts.IronIngot.amount).toBe(6)
      expect(fires).toBe(1)
    })
  })

  it('should throw when handed mismatched top-level shapes', () => {
    expect(() => applyDiff([], {})).toThrow()
  })
})
