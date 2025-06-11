import { describe, expect, it } from 'vitest'
import { getWikiUrl } from '@/utils/wiki-links'

describe('wiki-links', () => {
  describe('getWikiUrl', () => {
    it('should return empty string for empty input', () => {
      expect(getWikiUrl('')).toBe('')
    })

    it('should return empty string for null input', () => {
      expect(getWikiUrl(null as any)).toBe('')
    })

    it('should return empty string for undefined input', () => {
      expect(getWikiUrl(undefined as any)).toBe('')
    })

    it('should convert AI Limiter to correct wiki URL', () => {
      const result = getWikiUrl('AI Limiter')
      expect(result).toBe('https://satisfactory.wiki.gg/wiki/AI_Limiter')
    })

    it('should convert Iron Ore to correct wiki URL', () => {
      const result = getWikiUrl('Iron Ore')
      expect(result).toBe('https://satisfactory.wiki.gg/wiki/Iron_Ore')
    })

    it('should convert Quantum Encoder to correct wiki URL', () => {
      const result = getWikiUrl('Quantum Encoder')
      expect(result).toBe('https://satisfactory.wiki.gg/wiki/Quantum_Encoder')
    })

    it('should convert Smart Plating to correct wiki URL', () => {
      const result = getWikiUrl('Smart Plating')
      expect(result).toBe('https://satisfactory.wiki.gg/wiki/Smart_Plating')
    })

    it('should handle multiple spaces correctly', () => {
      const result = getWikiUrl('Multiple   Spaces   Test')
      expect(result).toBe('https://satisfactory.wiki.gg/wiki/Multiple_Spaces_Test')
    })

    it('should preserve case sensitivity', () => {
      const result = getWikiUrl('CamelCase Item')
      expect(result).toBe('https://satisfactory.wiki.gg/wiki/CamelCase_Item')
    })

    it('should handle single word items', () => {
      const result = getWikiUrl('Iron')
      expect(result).toBe('https://satisfactory.wiki.gg/wiki/Iron')
    })
  })
})
