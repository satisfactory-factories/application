// Quick test for wiki link functionality
// Note: This test requires running in a TypeScript environment or transpiling first
// The getWikiUrl function converts item/building names to Satisfactory wiki URLs

console.log('Wiki Link Generation Test Results:')
console.log('==================================')

// Test cases
const testCases = [
  { input: 'AI Limiter', expected: 'https://satisfactory.wiki.gg/wiki/AI_Limiter' },
  { input: 'Iron Ore', expected: 'https://satisfactory.wiki.gg/wiki/Iron_Ore' },
  { input: 'Quantum Encoder', expected: 'https://satisfactory.wiki.gg/wiki/Quantum_Encoder' },
  { input: 'Smart Plating', expected: 'https://satisfactory.wiki.gg/wiki/Smart_Plating' },
]

// Manual URL generation test (since we can't import TypeScript directly)
const manualGetWikiUrl = (displayName) => {
  if (!displayName) return ''
  const wikiName = displayName.replace(/\s+/g, '_')
  return `https://satisfactory.wiki.gg/wiki/${wikiName}`
}

testCases.forEach(({ input, expected }) => {
  const result = manualGetWikiUrl(input)
  const passed = result === expected
  console.log(`${passed ? '✅' : '❌'} ${input}:`)
  console.log(`  Expected: ${expected}`)
  console.log(`  Got:      ${result}`)
  console.log()
})
