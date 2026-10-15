/**
 * Reading values out of a tagged-property block.
 *
 * These are UE5 tagged properties with nested type names, but nothing here needs a general
 * property parser: every value we want is a literal that appears at a known name, so we find the
 * name and read the first matching literal after it. That survives a property being added or
 * reordered, which a positional parser would not.
 */

import type { SaveBytes } from '@/utils/game-save/chunks'
import type { SaveObject } from '@/utils/game-save/save-parser'

// latin1 keeps one byte to one character, so a match index in the string is also a byte offset.
const latin1 = new TextDecoder('latin1')

export const asText = (data: SaveBytes): string => latin1.decode(data)

/** Search for `pattern` only in the part of the block that follows `property`. */
export const matchAfter = (text: string, property: string, pattern: RegExp): RegExpMatchArray | null => {
  const at = text.indexOf(property)
  if (at < 0) return null
  return text.slice(at).match(pattern)
}

export const matchAllAfter = (text: string, property: string, pattern: RegExp): RegExpMatchArray[] => {
  const at = text.indexOf(property)
  if (at < 0) return []
  return [...text.slice(at).matchAll(pattern)]
}

// The game spells impure "Inpure" in its own asset names. Kept verbatim so the pattern matches.
const PURITY = /RP_(Inpure|Normal|Pure)\0/
const RESOURCE = /\/Game\/FactoryGame\/Resource\/RawResources\/\w+\/Desc_(\w+)\.Desc_\w+_C\0/

export type SavePurity = 'impure' | 'normal' | 'pure'

const PURITY_NAMES: Record<string, SavePurity> = {
  Inpure: 'impure',
  Normal: 'normal',
  Pure: 'pure',
}

/** The node's purity, or null when the save is silent and the level default stands. */
export const readPurityOverride = (text: string): SavePurity | null => {
  const match = matchAfter(text, 'mPurityOverride', PURITY)
  return match ? PURITY_NAMES[match[1]] : null
}

/** The node's resource descriptor (`OreIron`), or null when the level default stands. */
export const readResourceOverride = (text: string): string | null => {
  const match = matchAfter(text, 'mResourceClassOverride', RESOURCE)
  return match ? match[1] : null
}

/**
 * An IntProperty's value. Layout after the name: the type string, an int32 size, an int32 array
 * index, one pad byte, then the value.
 */
export const readInt32Property = (object: SaveObject, property: string): number | null => {
  const text = asText(object.data)
  const at = text.indexOf(property)
  if (at < 0) return null

  const view = new DataView(object.data.buffer, object.data.byteOffset, object.data.byteLength)
  const typeLengthAt = at + property.length + 1
  if (typeLengthAt + 4 > object.data.byteLength) return null

  const typeLength = view.getInt32(typeLengthAt, true)
  const valueAt = typeLengthAt + 4 + typeLength + 4 + 4 + 1
  if (valueAt + 4 > object.data.byteLength) return null

  return view.getInt32(valueAt, true)
}

/** An EnumProperty's literal, e.g. `NRM_Strict`. Null when the property is absent. */
export const readEnumProperty = (text: string, property: string, prefix: string): string | null => {
  const match = matchAfter(text, property, new RegExp(`${prefix}_\\w+`))
  return match ? match[0] : null
}
