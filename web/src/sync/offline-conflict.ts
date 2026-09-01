import type { Factory, FactoryItem } from 'common'
import { stableStringify } from '@/sync/room-state'

/**
 * The pure half of the offline conflict prompt: what two versions of one factory
 * disagree about, stated as evidence a person can read. Nothing here knows about the
 * socket, the store or the tab; the engine decides *which* factories clash and this
 * decides what to show for each.
 */

/** One product's two versions. `null` on a side means that side has no such product. */
export interface ConflictProductRow {
  itemId: string
  live: number | null
  mine: number | null
  /** Same item, different recipe: the amounts alone would not explain the difference. */
  recipeChanged: boolean
}

export interface ConflictFactory {
  factoryId: number
  /** Whatever the user knows it as: this device's name, or the live one when only it has it. */
  name: string
  /** The live plan no longer holds it. Live wins = it stays deleted, mine wins = restored. */
  liveDeleted: boolean
  /** This device removed it while the live plan carried on editing it. */
  mineDeleted: boolean
  products: ConflictProductRow[]
  /** The two versions also differ somewhere the product rows cannot show. */
  otherChanges: boolean
}

/**
 * Authored fields, deliberately a whitelist: everything else on a factory is derived from
 * the products by the calculation engine, so comparing whole records would report "other
 * changes" for every changed amount. A field missing here costs a summary line, never a
 * wrong winner.
 */
const AUTHORED: (keyof Factory)[] = [
  'name',
  'notes',
  'tasks',
  'inputs',
  'powerProducers',
  'customBuildings',
  'exportCalculator',
  'partDisposal',
  'group',
  'icon',
  'checklistEnabled',
  'checklistExports',
]

/** A blank row has no item, so it is nothing a reader could compare. */
const productsById = (factory: Factory | null): Map<string, FactoryItem> =>
  new Map((factory?.products ?? []).filter(product => product.id).map(product => [product.id, product]))

/** Only the products that actually differ: a matching row is not evidence of anything. */
export const conflictProductRows = (live: Factory | null, mine: Factory | null): ConflictProductRow[] => {
  const liveById = productsById(live)
  const mineById = productsById(mine)
  const rows: ConflictProductRow[] = []

  for (const [itemId, liveProduct] of liveById) {
    const mineProduct = mineById.get(itemId)
    if (mineProduct && mineProduct.amount === liveProduct.amount && mineProduct.recipe === liveProduct.recipe) continue
    rows.push({
      itemId,
      live: liveProduct.amount,
      mine: mineProduct ? mineProduct.amount : null,
      recipeChanged: mineProduct !== undefined && mineProduct.recipe !== liveProduct.recipe,
    })
  }

  for (const [itemId, mineProduct] of mineById) {
    if (liveById.has(itemId)) continue
    rows.push({ itemId, live: null, mine: mineProduct.amount, recipeChanged: false })
  }

  return rows
}

const authoredPrint = (factory: Factory): string =>
  stableStringify(Object.fromEntries(AUTHORED.map(field => [field, factory[field]])))

export const differsOutsideProducts = (live: Factory | null, mine: Factory | null): boolean =>
  live !== null && mine !== null && authoredPrint(live) !== authoredPrint(mine)

/**
 * The section one clashing factory earns, or null when there is nothing to decide:
 * two versions that agree, or two that differ only in figures the recalculation
 * derives — a peer editing a factory this one imports from moves those on both sides.
 */
export const describeClash = (
  factoryId: number,
  live: Factory | null,
  mine: Factory | null,
): ConflictFactory | null => {
  if (!live && !mine) return null
  if (live && mine && stableStringify(live) === stableStringify(mine)) return null

  const products = conflictProductRows(live, mine)
  const otherChanges = differsOutsideProducts(live, mine)
  if (products.length === 0 && !otherChanges && live !== null && mine !== null) return null

  return {
    factoryId,
    name: mine?.name ?? live?.name ?? `Factory ${factoryId}`,
    liveDeleted: live === null,
    mineDeleted: mine === null,
    products,
    otherChanges,
  }
}

/**
 * A short, stable fingerprint of a serialized record. The mirror keeps one per edited
 * factory so a device reopened days later can still tell a peer's edit from its own —
 * the baseline the print belongs to is gone by then, and only its shape is affordable.
 */
export const fingerprint = (print: string): string => {
  let hash = 0x811C9DC5
  for (let index = 0; index < print.length; index++) {
    hash ^= print.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}
