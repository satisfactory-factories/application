// Applies the result of a calculation run back onto the live (reactive) factory data,
// writing only the values that actually differ. calculateFactory/calculateFactories run
// the engine against a plain structuredClone of the plan, then commit the result through
// this diff. Because unchanged values are never written and object/array identity is
// preserved, Vue watchers and component re-renders fire only for genuine changes — a
// full recalculation that changes nothing performs zero reactive writes.

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// Detach a value from the calculation clone before storing it in the live data, so the
// live plan never shares references with the (discarded) clone tree.
const detach = <T>(value: T): T => {
  if (value === null || typeof value !== 'object') {
    return value
  }
  return structuredClone(value)
}

const applyValueDiff = (
  parent: Record<string, unknown> | unknown[],
  key: string | number,
  targetValue: unknown,
  sourceValue: unknown,
): number => {
  if (Object.is(targetValue, sourceValue)) {
    return 0
  }
  if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
    return applyArrayDiff(targetValue, sourceValue)
  }
  if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
    return applyObjectDiff(targetValue, sourceValue)
  }
  // Primitive change, or the value changed shape (e.g. null -> object): replace it.
  (parent as Record<string | number, unknown>)[key] = detach(sourceValue)
  return 1
}

const applyObjectDiff = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): number => {
  let writes = 0
  for (const key of Object.keys(target)) {
    if (!(key in source)) {
      delete target[key]
      writes++
    }
  }
  for (const key of Object.keys(source)) {
    if (key in target) {
      writes += applyValueDiff(target, key, target[key], source[key])
    } else {
      target[key] = detach(source[key])
      writes++
    }
  }
  return writes
}

const applyArrayDiff = (target: unknown[], source: unknown[]): number => {
  let writes = 0
  const shared = Math.min(target.length, source.length)
  for (let i = 0; i < shared; i++) {
    writes += applyValueDiff(target, i, target[i], source[i])
  }
  if (target.length > source.length) {
    target.splice(source.length)
    writes++
  } else {
    for (let i = shared; i < source.length; i++) {
      target.push(detach(source[i]))
      writes++
    }
  }
  return writes
}

// Mutates `target` in place until it deep-equals `source`, preserving the identity of
// every object and array that exists in both. Returns the number of writes performed
// (0 means the two were already identical).
export const applyDiff = (target: object, source: object): number => {
  if (Array.isArray(target) && Array.isArray(source)) {
    return applyArrayDiff(target, source)
  }
  if (isPlainObject(target) && isPlainObject(source)) {
    return applyObjectDiff(target, source)
  }
  throw new Error('applyDiff: target and source must both be plain objects or both be arrays')
}
