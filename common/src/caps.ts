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

  // Element ceilings inside one factory record. Sized against the game's own totals —
  // 181 items, 24 buildings, 306 recipes — with room for several updates' worth of
  // growth, so a plan is only ever refused when its shape is impossible rather than large.

  /** Item-keyed maps: parts, raw resources, disposal, export calculator, dependencies. */
  itemKeys: 1_000,
  /** Building-keyed maps: building requirements and their material costs. */
  buildingKeys: 200,
  /** Rows in one of a factory's lists: imports, products, producers, custom buildings. */
  factoryRows: 500,
  /** Nested lists on one row: building groups, ingredients, by-products, transport groups. */
  rowEntries: 200,
  /** Checklist export keys, one per `<factoryId>:<part>` pair the plan ticks. */
  checklistKeys: 2_000,
  /** Dependency requests recorded against one part, one per requesting factory. */
  requestsPerPart: 300,
  /** Factory groups one plan may define. */
  groupsPerPlan: 300,
} as const
