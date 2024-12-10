export function formatNumber (value: any): string {
  const num = Number(value)
  if (isNaN(num)) {
    // throw new TypeError('The provided value is not a number');
    // Instead of an error - just return the value as is.
    return value
  }
  return num % 1 === 0 ? num.toFixed(0) : parseFloat(num.toFixed(3)).toString()
}
