/**
 * The v7 validation table. Two kinds of limit and they behave differently:
 * names, notes and tasks are silently truncated to preserve today's behaviour,
 * everything else is rejected outright.
 */
export const CAPS = {
  /** Room/tab, factory and group names. */
  name: 200,
  /** Factory notes. */
  notes: 1000,
  /** A single task title. */
  taskTitle: 200,
  /** Tasks per factory; the overflow is dropped. */
  tasks: 50,
  /** An invite slug must match this after lowercasing, or it is rejected. */
  slugPattern: /^[a-z0-9-]{1,100}$/,
  slugMax: 100,
  passwordMin: 1,
  passwordMax: 100,
  /** Hex or a named colour; long enough for `rgba(...)` and nothing more. */
  groupColor: 32,
  factoriesPerRoom: 300,
  ownedRoomsPerUser: 10,
  /** Owned plus joined. */
  membershipsPerUser: 25,
  /** An advisory field-lock key. Opaque to the server, minted by the client. */
  fieldKey: 128,
  /** Field locks one socket may hold at once, counted across every room on it. */
  fieldLocksPerConnection: 32,
  /** Every string with no cap of its own. */
  string: 10_000,
} as const
