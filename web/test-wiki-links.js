// Quick test for wiki link functionality
import { getWikiUrl } from './src/utils/wiki-links.js'

// Test cases
const testCases = [
  { input: 'AI Limiter', expected: 'https://satisfactory.wiki.gg/wiki/AI_Limiter' },
  { input: 'Iron Ore', expected: 'https://satisfactory.wiki.gg/wiki/Iron_Ore' },
  { input: 'Quantum Encoder', expected: 'https://satisfactory.wiki.gg/wiki/Quantum_Encoder' },
  { input: 'Smart Plating', expected: 'https://satisfactory.wiki.gg/wiki/Smart_Plating' },
]

console.log('Testing wiki link generation...\n')

testCases.forEach(({ input, expected }) => {
  const result = getWikiUrl(input)
  const passed = result === expected
  console.log(`${passed ? '✅' : '❌'} ${input}:`)
  console.log(`  Expected: ${expected}`)
  console.log(`  Got:      ${result}`)
  console.log()
})
