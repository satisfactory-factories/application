/**
 * Tab-bar order is per user for synced tabs and per browser for local ones, so the
 * two halves are reconciled rather than merged:
 *
 * - A reorder persists only the synced tabs' relative order (`PUT /rooms/order`
 *   with `syncedTabOrder`), because a local tab has no row on the server to hold
 *   an index in.
 * - When a server order arrives, every non-synced tab keeps the slot it already
 *   occupies and the synced tabs are dealt into what is left, in server order.
 *
 * That makes reconciliation idempotent: re-applying an order the bar already shows
 * returns the same array, so a refresh can never walk a tab across the bar.
 */

/** The half of a drag worth sending: synced tabs, in the sequence displayed. */
export const syncedTabOrder = (
  tabIds: string[],
  isSynced: (tabId: string) => boolean,
): string[] => tabIds.filter(isSynced)

/** Rebuilds the whole bar from the server's order without moving a single local tab. */
export const interleaveTabOrder = (
  tabIds: string[],
  serverOrder: string[],
  isSynced: (tabId: string) => boolean,
): string[] => {
  const present = new Set(tabIds)
  const queue = serverOrder.filter(tabId => present.has(tabId) && isSynced(tabId))

  // A synced tab the server order does not mention keeps its relative position at
  // the back rather than being dropped — the bar must never lose a tab.
  const queued = new Set(queue)
  queue.push(...tabIds.filter(tabId => isSynced(tabId) && !queued.has(tabId)))

  let next = 0
  return tabIds.map(tabId => (isSynced(tabId) ? queue[next++] : tabId))
}

export const sameOrder = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index])
