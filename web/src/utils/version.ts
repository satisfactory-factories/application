// Version comparison for the release check. A trimmed port of the backend's
// `backend/utils/client-version.ts`: the workspace has no package the two could share, and the
// planner only ever needs "is theirs newer than mine", not the gate's full set.

interface ParsedVersion {
  core: number[]
  prerelease: string[]
}

// Accepts `1.2.3`, `v1.2`, `0.6.0-beta.1`, `1.0.0+build`. Anything else is null, and a null is
// never treated as newer, so junk from the API can't provoke a reload prompt.
export const parseVersion = (value: string | null | undefined): ParsedVersion | null => {
  if (typeof value !== 'string') return null

  const trimmed = value.trim().replace(/^v/i, '')
  if (trimmed === '') return null

  // Build metadata is explicitly not part of precedence.
  const withoutBuild = trimmed.split('+')[0]
  const separator = withoutBuild.indexOf('-')
  const coreText = separator === -1 ? withoutBuild : withoutBuild.slice(0, separator)
  const prereleaseText = separator === -1 ? '' : withoutBuild.slice(separator + 1)

  const parts = coreText.split('.')
  if (parts.length === 0 || parts.length > 3) return null

  const core: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    core.push(Number(part))
  }
  while (core.length < 3) core.push(0)

  if (prereleaseText === '' && separator !== -1) return null

  return {
    core,
    prerelease: prereleaseText === '' ? [] : prereleaseText.split('.'),
  }
}

const comparePrerelease = (a: string[], b: string[]): number => {
  // A release outranks any prerelease of the same core version.
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i]
    const right = b[i]
    // Fewer identifiers, all else equal, is the lower precedence.
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue

    const leftIsNumeric = /^\d+$/.test(left)
    const rightIsNumeric = /^\d+$/.test(right)
    if (leftIsNumeric && rightIsNumeric) return Number(left) < Number(right) ? -1 : 1
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    if (leftIsNumeric !== rightIsNumeric) return leftIsNumeric ? -1 : 1
    return left < right ? -1 : 1
  }

  return 0
}

// True only when `candidate` is strictly newer than `current`. Never "different from": a tab
// running a build the API has not caught up with yet must not be told to reload.
export const isNewerVersion = (candidate: string | null | undefined, current: string | null | undefined): boolean => {
  const left = parseVersion(candidate)
  const right = parseVersion(current)
  if (!left || !right) return false

  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i]
  }

  return comparePrerelease(left.prerelease, right.prerelease) > 0
}
