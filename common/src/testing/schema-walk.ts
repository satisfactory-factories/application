import { z } from 'zod'

/**
 * Test-only introspection over the zod plan schemas.
 *
 * The schemas strip unknown keys, so they are the only thing between the wire and the
 * database. A round-trip that deep-equals its input only proves the keys the input happened
 * to carry; a key nothing populates is untested however green the suite looks. These helpers
 * close that by reading the key list off the schema itself:
 *
 * - `declaredKeys` is every key the schema defines.
 * - `presentKeys` is every one of those a given plan actually carries.
 * - `withoutKey` returns the same schema with one key removed, so a spec can prove its own
 *   round-trip assertion would have failed if that key were dropped.
 *
 * Keys are reported as `<object>.<key>` where `<object>` names the object schema that owns
 * them, not the path they were reached by. One shared sub-schema is therefore one entry:
 * `buildingGroupSchema.purity` is satisfied by any group that carries a purity, rather than
 * demanding one on a power producer's groups, which never have them.
 */

type AnyDef = { type: string } & Record<string, unknown>
type Shape = Record<string, z.ZodType>

const defOf = (schema: z.ZodType): AnyDef => (schema as unknown as { _zod: { def: AnyDef } })._zod.def

/** Wrapper types that hold exactly one inner schema and no keys of their own. */
const WRAPPERS = new Set(['optional', 'nullable', 'default', 'prefault', 'nonoptional', 'readonly'])

const unwrap = (schema: z.ZodType): z.ZodType => {
  let current = schema
  while (WRAPPERS.has(defOf(current).type)) current = defOf(current).innerType as z.ZodType
  return current
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A module of exported schemas, so owners are named rather than described by their path. */
export type SchemaNames = Record<string, unknown>

/**
 * One label per object schema in the tree, resolved from the schema alone so every walk of it
 * agrees. Named exports win; anything anonymous (an inline `z.object` on one field) falls back
 * to the path it is first reached by.
 */
export const labelObjects = (root: z.ZodType, names: SchemaNames = {}): Map<z.ZodType, string> => {
  const exported = new Map<z.ZodType, string>()
  for (const [name, value] of Object.entries(names)) {
    if (!value || typeof value !== 'object' || !('_zod' in value)) continue
    const inner = unwrap(value as z.ZodType)
    if (defOf(inner).type === 'object' && !exported.has(inner)) exported.set(inner, name)
  }

  const labels = new Map<z.ZodType, string>()
  const walk = (schema: z.ZodType, path: string): void => {
    const node = unwrap(schema)
    const def = defOf(node)

    if (def.type === 'array') return walk(def.element as z.ZodType, `${path}[]`)
    if (def.type === 'record') return walk(def.valueType as z.ZodType, `${path}.*`)
    if (def.type !== 'object' || labels.has(node)) return

    labels.set(node, exported.get(node) ?? path ?? 'root')
    for (const [key, value] of Object.entries(def.shape as Shape)) {
      walk(value, path ? `${path}.${key}` : key)
    }
  }

  walk(root, '')
  return labels
}

/** Every `<object>.<key>` the schema defines, sorted. */
export const declaredKeys = (root: z.ZodType, names: SchemaNames = {}): string[] => {
  const labels = labelObjects(root, names)
  const found = new Set<string>()

  for (const [node, owner] of labels) {
    for (const key of Object.keys(defOf(node).shape as Shape)) found.add(`${owner}.${key}`)
  }

  return [...found].sort()
}

/**
 * Every `<object>.<key>` the schema defines that `value` actually carries somewhere. An
 * absent or `undefined` field is not carried; `null` is, because null is a stored choice.
 */
export const presentKeys = (root: z.ZodType, value: unknown, names: SchemaNames = {}): string[] => {
  const labels = labelObjects(root, names)
  const found = new Set<string>()

  const walk = (schema: z.ZodType, subject: unknown): void => {
    if (subject === undefined || subject === null) return
    const node = unwrap(schema)
    const def = defOf(node)

    if (def.type === 'array') {
      if (Array.isArray(subject)) for (const entry of subject) walk(def.element as z.ZodType, entry)
      return
    }
    if (def.type === 'record') {
      if (isRecord(subject)) for (const entry of Object.values(subject)) walk(def.valueType as z.ZodType, entry)
      return
    }
    if (def.type !== 'object' || !isRecord(subject)) return

    const owner = labels.get(node)
    for (const [key, child] of Object.entries(def.shape as Shape)) {
      if (subject[key] === undefined) continue
      found.add(`${owner}.${key}`)
      walk(child, subject[key])
    }
  }

  walk(root, value)
  return [...found].sort()
}

/**
 * The same schema with `<owner>.<key>` removed, for proving a round-trip notices the loss.
 *
 * The rebuilt copy keeps the shape and the nullability that decide what survives a parse, and
 * drops the size caps and refinements, which decide what is rejected outright. That is the
 * point of the mutant: it must strip the key and otherwise behave, so the only thing the
 * spec's own assertion can be reacting to is the missing key.
 */
export const withoutKey = (
  root: z.ZodType,
  owner: string,
  key: string,
  names: SchemaNames = {},
): z.ZodType => {
  const labels = labelObjects(root, names)
  const cache = new Map<z.ZodType, z.ZodType>()

  const rebuild = (schema: z.ZodType): z.ZodType => {
    const cached = cache.get(schema)
    if (cached) return cached

    const def = defOf(schema)
    let result: z.ZodType

    switch (def.type) {
      case 'optional':
        result = rebuild(def.innerType as z.ZodType).optional()
        break
      case 'nullable':
        result = rebuild(def.innerType as z.ZodType).nullable()
        break
      case 'default':
      case 'prefault':
        result = rebuild(def.innerType as z.ZodType).default(def.defaultValue as never)
        break
      case 'array':
        result = z.array(rebuild(def.element as z.ZodType))
        break
      case 'record':
        result = z.record(def.keyType as z.ZodType<string>, rebuild(def.valueType as z.ZodType))
        break
      case 'object': {
        const owns = labels.get(schema) === owner
        const shape: Shape = {}
        for (const [name, child] of Object.entries(def.shape as Shape)) {
          if (owns && name === key) continue
          shape[name] = rebuild(child)
        }
        result = z.object(shape)
        break
      }
      default:
        result = schema
    }

    cache.set(schema, result)
    return result
  }

  return rebuild(root)
}
