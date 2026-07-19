// Lightweight fuzzy matcher used by the Parts browser. No external deps.
// Scores: exact > prefix > word-boundary prefix > substring > subsequence > no match (0).

export interface FuzzyResult<T> {
  item: T;
  score: number;
}

export const fuzzyScore = (query: string, target: string): number => {
  const q = query.trim().toLowerCase()
  const t = target.trim().toLowerCase()

  if (!q || !t) {
    return 0
  }

  if (t === q) {
    return 100
  }

  if (t.startsWith(q)) {
    return 90
  }

  // Word-boundary prefix, e.g. "iron p" matching "Alternate: Iron Pipe"
  if (t.includes(` ${q}`) || t.includes(`: ${q}`)) {
    return 80
  }

  const substringIndex = t.indexOf(q)
  if (substringIndex !== -1) {
    // Earlier occurrences rank slightly higher
    return 70 - Math.min(substringIndex, 19)
  }

  // Subsequence match: all query characters appear in order, e.g. "irnpl" -> "Iron Plate".
  // To avoid nonsense matches (e.g. "iron" hitting "Packaged N-i-t-r-o-ge-n Gas"), the
  // subsequence must start at a word boundary and stay reasonably compact.
  let searchFrom = 0
  let firstIndex = -1
  let lastIndex = -1
  for (const char of q) {
    const found = t.indexOf(char, searchFrom)
    if (found === -1) {
      return 0
    }
    if (firstIndex === -1) {
      firstIndex = found
    }
    lastIndex = found
    searchFrom = found + 1
  }

  const startsWord = firstIndex === 0 || [' ', ':', '-', '('].includes(t[firstIndex - 1])
  if (!startsWord) {
    return 0
  }

  const span = lastIndex - firstIndex + 1
  const compactness = q.length / span // 1 = perfectly contiguous
  if (compactness < 0.5) {
    return 0
  }
  return Math.round(10 + compactness * 30)
}

// Returns matching items sorted by descending score. Ties keep the original order.
export const fuzzySearch = <T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
): T[] => {
  if (!query.trim()) {
    return items
  }

  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, getText(item)) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(result => result.item)
}
