import { writeLocalStorage } from '@/utils/safe-storage'

/**
 * The last snapshot link made from each tab, with a fingerprint of the plan it
 * froze. A snapshot is a dead copy: making a second one from bytes identical to
 * the first hands out two links to the same thing, and the share dialog used to
 * do exactly that every time it was reopened. Kept per browser because the link
 * is only ever needed by whoever made it.
 */
export const SNAPSHOT_LINKS_KEY = 'snapshotLinks'

export interface SnapshotLink {
  shareId: string
  fingerprint: string
}

/**
 * FNV-1a over the payload as the share endpoint receives it, with the length
 * carried alongside: the question is only ever "is this the same plan I froze",
 * so a cheap hash is enough and a collision would need the same byte count too.
 */
export const fingerprintPlan = (payload: unknown): string => {
  const text = JSON.stringify(payload) ?? ''
  let hash = 0x81_1C_9D_C5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01_00_01_93)
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`
}

export const readSnapshotLinks = (): Record<string, SnapshotLink> => {
  const raw = localStorage.getItem(SNAPSHOT_LINKS_KEY)
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const links: Record<string, SnapshotLink> = {}
  for (const [tabId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const record = value as Partial<SnapshotLink> | null
    if (typeof record?.shareId !== 'string' || record.shareId === '') continue
    if (typeof record.fingerprint !== 'string' || record.fingerprint === '') continue
    links[tabId] = { shareId: record.shareId, fingerprint: record.fingerprint }
  }
  return links
}

export const readSnapshotLink = (tabId: string): SnapshotLink | undefined =>
  readSnapshotLinks()[tabId]

export const rememberSnapshotLink = (tabId: string, link: SnapshotLink): void => {
  const links = readSnapshotLinks()
  links[tabId] = link
  writeLocalStorage(SNAPSHOT_LINKS_KEY, JSON.stringify(links))
}

/**
 * Drops the records of tabs this browser no longer holds. Nothing else sweeps
 * them, and a tab closed years ago would otherwise keep its link forever.
 */
export const pruneSnapshotLinks = (keep: Iterable<string>): void => {
  const known = new Set(keep)
  const links = readSnapshotLinks()
  const stale = Object.keys(links).filter(tabId => !known.has(tabId))
  if (stale.length === 0) return

  for (const tabId of stale) delete links[tabId]
  writeLocalStorage(SNAPSHOT_LINKS_KEY, JSON.stringify(links))
}
