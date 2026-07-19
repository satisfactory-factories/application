import { describe, expect, it } from 'vitest'
import { fuzzyScore, fuzzySearch } from '@/utils/fuzzySearch'

describe('fuzzyScore', () => {
  it('should return 0 for an empty query or target', () => {
    expect(fuzzyScore('', 'Iron Plate')).toBe(0)
    expect(fuzzyScore('iron', '')).toBe(0)
    expect(fuzzyScore('   ', 'Iron Plate')).toBe(0)
  })

  it('should score an exact match highest', () => {
    expect(fuzzyScore('iron plate', 'Iron Plate')).toBe(100)
  })

  it('should score a prefix match above a substring match', () => {
    const prefix = fuzzyScore('iron', 'Iron Plate')
    const substring = fuzzyScore('plate', 'Reinforced Iron Plate')
    expect(prefix).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(0)
  })

  it('should score a word-boundary match above a plain substring match', () => {
    const wordBoundary = fuzzyScore('plate', 'Iron Plate')
    const midWord = fuzzyScore('late', 'Iron Plate')
    expect(wordBoundary).toBeGreaterThan(midWord)
  })

  it('should match word boundaries after a colon', () => {
    expect(fuzzyScore('pure', 'Alternate: Pure Iron Ingot')).toBe(80)
  })

  it('should match subsequences', () => {
    expect(fuzzyScore('irnplt', 'Iron Plate')).toBeGreaterThan(0)
  })

  it('should not match when characters are out of order', () => {
    expect(fuzzyScore('etalp', 'Iron Plate')).toBe(0)
  })

  it('should not match scattered subsequences that start mid-word', () => {
    // "iron" appears as a subsequence in "Packaged Nitrogen Gas" but is a nonsense match
    expect(fuzzyScore('iron', 'Packaged Nitrogen Gas')).toBe(0)
  })

  it('should not match subsequences spread too thinly across the target', () => {
    expect(fuzzyScore('pgs', 'Packaged Nitrogen Gas')).toBe(0)
  })

  it('should be case-insensitive', () => {
    expect(fuzzyScore('IRON PLATE', 'iron plate')).toBe(100)
  })
})

describe('fuzzySearch', () => {
  const items = [
    { name: 'Iron Plate' },
    { name: 'Iron Rod' },
    { name: 'Reinforced Iron Plate' },
    { name: 'Copper Sheet' },
  ]

  it('should return all items for an empty query', () => {
    expect(fuzzySearch('', items, item => item.name)).toEqual(items)
  })

  it('should filter out non-matching items', () => {
    const results = fuzzySearch('iron', items, item => item.name)
    expect(results.map(item => item.name)).not.toContain('Copper Sheet')
    expect(results).toHaveLength(3)
  })

  it('should rank prefix matches before substring matches', () => {
    const results = fuzzySearch('iron plate', items, item => item.name)
    expect(results[0].name).toBe('Iron Plate')
    expect(results[1].name).toBe('Reinforced Iron Plate')
  })

  it('should keep original order for equal scores', () => {
    const results = fuzzySearch('iron', items, item => item.name)
    expect(results[0].name).toBe('Iron Plate')
    expect(results[1].name).toBe('Iron Rod')
  })
})
