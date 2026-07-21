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
// Reverse-solves and building-group writebacks routinely produce values like 120.001 or
// 99.999 out of 3dp float round-trips, and at that precision it is extremely unlikely the
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

export function formatNumberFully (value: any, precision = 3): number {
  const result = formatNumber(value, precision)

  if (isNaN(Number(result))) {
    return 0
  }
  return snapNearInteger(Number(result))
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
