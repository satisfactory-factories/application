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

export function formatNumberFully (value: any, precision = 3): number {
  return Number(formatNumber(value, precision))
}

// Returns a number formatted in the value of megawatts or gigawatts. If supplied GW, the number is divided by 1000.
export function formatPower (value: number): { value: string, unit: string } {
  let formattedValue = formatNumber(value, 1)
  let unit = 'MW'

  // If the unit is above 1000, or less than -1000, convert the unit into gigawatts.
  if (value >= 1000 || value <= -1000) {
    formattedValue = formatNumber(value / 1000, 1)
    unit = 'GW'
  }
  return { value: formattedValue, unit }
}
