export function formatNumber (value: any): string {
  const num = Number(value)
  if (isNaN(num)) {
    // throw new TypeError('The provided value is not a number');
    // Instead of an error - just return the value as is.
    return value
  }
  return num % 1 === 0 ? num.toFixed(0) : parseFloat(num.toFixed(3)).toString()
}

export function formatNumberFully (value: any): number {
  return Number(formatNumber(value))
}

// Returns a number formatted in the value of megawatts or gigawatts. If supplied GW, the number is divided by 1000.
export function formatPower (value: number): { value: string, unit: string } {
  let formattedValue = formatNumber(value)
  let unit = 'MW'

  // If the unit is above 1000, or less than -1000, convert the unit into gigawatts.
  if (value >= 1000 || value <= -1000) {
    formattedValue = formatNumber(value / 1000)
    unit = 'GW'
  }
  return { value: formattedValue, unit }
}
