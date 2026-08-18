export function formatNumber (value: any, precision = 3): string {
  const num = Number(value)
  if (isNaN(num)) {
    // Instead of throwing an error, return the value as is.
    return value
  }
  // If the number is an integer, return it with no decimal places.
  if (num % 1 === 0) {
    return num.toFixed(0)
  }

  // Based on the precision required, round appropriately.
  if (precision === 0) {
    return Math.round(num).toString()
  }

  const multi = Math.pow(10, precision)

  // Always round to the nearest number based off precision.
  const truncated = Math.round(num * multi) / multi
  return truncated.toString()
}

// Quantities within this distance of a whole number are assumed to BE that whole number.
// Reverse-solves and 3dp float round-trips routinely produce values like 120.001 or
// 99.999 from whole-number inputs, and at that precision it is extremely unlikely the
// user wanted anything but the integer.
const INTEGER_SNAP_TOLERANCE = 0.002

// Snaps a value to the nearest whole number when it is within the tolerance. Never snaps
// to 0 — tiny legitimate quantities (e.g. 0.001 of a byproduct) must survive.
export function snapNearInteger (value: number, tolerance = INTEGER_SNAP_TOLERANCE): number {
  const nearest = Math.round(value)
  if (nearest === 0) {
    return value
  }
  return Math.abs(value - nearest) <= tolerance ? nearest : value
}

// Drift baked into a saved plan is proportional, not absolute: #485 stored a fuel rate
// 8e-7 too high, which a 240-generator plant multiplied into 2400.002 and a 1,200-generator
// one into 12000.01. The flat tolerance above catches the former and misses the latter, so
// the repair pass that runs over loaded plans scales its tolerance with the value.
const DRIFT_RELATIVE_TOLERANCE = 1e-6

// Snaps a value a saved plan holds a rounding hair off a whole number. Deliberately looser
// than snapNearInteger for large values and identical to it for small ones — a value must
// still be within one part per million of the integer, which no hand-typed quantity is.
export function snapDriftedInteger (value: number): number {
  return snapNearInteger(value, Math.max(INTEGER_SNAP_TOLERANCE, Math.abs(value) * DRIFT_RELATIVE_TOLERANCE))
}

// `snap` is opt-in and context-driven: callers snap only when the value derives from
// whole-number inputs (so a 0.001 offset is float noise). Values derived from
// deliberately precise inputs — e.g. a building group clocked at 223.333% — must NOT
// snap, so the planner keeps matching the in-game figures (535.999 stays 535.999).
export function formatNumberFully (value: any, precision = 3, snap = false): number {
  const result = formatNumber(value, precision)

  if (isNaN(Number(result))) {
    return 0
  }
  return snap ? snapNearInteger(Number(result)) : Number(result)
}

// Matches the in-game power screens: MW with thousands separators (e.g. "5,100 MW").
// The non-breaking space stops the value wrapping onto a new line before the unit.
export function formatMw (value: number): string {
  return `${Number(formatNumber(value, 1)).toLocaleString('en-US')}\u00A0MW`
}

// Always renders in gigawatts (value supplied in MW). Reserved for the statistics
// side tray, which is too space-constrained for full MW figures — everywhere else
// shows MW via formatMw to match the game's power screens.
export function formatGw (value: number): string {
  return `${Number(formatNumber(value / 1000, 2)).toLocaleString('en-US')}\u00A0GW`
}

// A quantity squeezed under a 36px icon: at most four characters, so 1234 reads 1.2k and
// 10000 reads 10k. Deliberately not Intl.NumberFormat's compact notation, which rounds to
// "10K" with a capital and localises the suffix — the planner's figures are per-minute rates
// and read as k/M everywhere else. The sign is the caller's to draw; this formats the value
// it is given, negative or not.
export function formatCompact (value: number): string {
  // Largest unit first, and the threshold is 0.9995 rather than 1 so a value that would round
  // up to "1000k" is promoted to "1M" instead of overflowing the four characters.
  for (const [divisor, suffix] of [[1_000_000, 'M'], [1000, 'k']] as const) {
    const scaled = value / divisor
    if (Math.abs(scaled) < 0.9995) continue
    // One decimal below ten (1.2k), none above (12k) — the difference between 12.3k and 12k is
    // not worth the two characters at this size.
    return `${formatNumber(scaled, Math.abs(scaled) < 10 ? 1 : 0)}${suffix}`
  }

  // Sub-1000 keeps one decimal only where it changes the reading, so 0.5 survives and
  // 320.0001 does not become "320.0".
  return formatNumber(value, 1)
}
