import { Gauge, Registry } from 'prom-client'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import type { Model } from 'mongoose'

import {
  ACTIVE_ACCOUNT_WINDOWS,
  DELETED_OWNER,
  METRICS_CACHE_MS,
  METRICS_SLOW_CACHE_MS,
  METRICS_TOP_N,
} from './metrics.constants'
import { CLOCK, Clock } from '../rooms/clock'
import { CachedQuery } from './cached-query'
import { ConnectionRegistry } from '../realtime/connection-registry'
import { EventCountersService } from '../event-counters/event-counters.service'
import { Room } from '../rooms/schemas/room.schema'
import { ROOM_ACTIVITY_KINDS } from '../rooms/schemas/room-activity.schema'
import { RoomMembership } from '../rooms/schemas/room-membership.schema'
import { RoomTotalsService } from '../room-totals/room-totals.service'
import { Share } from '../legacy/share.schema'
import { TelemetryService } from './telemetry.service'
import type { TelemetrySnapshot } from './telemetry.service'
import { User } from '../auth/user.schema'

/** The fast numbers: four counts and one aggregation over the rooms collection. */
interface CheapCounts {
  sharedRooms: number
  privateRooms: number
  roomFactories: number
  roomRevisions: number
  roomMembers: number
  users: number
  signIns: number
  shares: number
  shareOpens: number
  roomActions: Map<string, number>
}

interface OwnedTotal { name: string, value: number }
interface RoomTotal { roomId: string, owner: string, factories: number }
interface ShareTotal { shareId: string, opens: number }

/** The slow numbers: five window counts and three top-N aggregations. */
interface SlowStats {
  activeAccounts: Array<readonly [string, number]>
  newAccounts: Array<readonly [string, number]>
  signedInAccounts: Array<readonly [string, number]>
  topRooms: RoomTotal[]
  topEditors: OwnedTotal[]
  topOwners: OwnedTotal[]
  newShares: Array<readonly [string, number]>
  topShares: ShareTotal[]
  newRooms: Array<readonly [string, number]>
  newMemberships: Array<readonly [string, number]>
}

/**
 * Everything `GET /metrics` serves.
 *
 * The registry is created per instance rather than using prom-client's default global one.
 * Two Nest apps in one process — which is every backend spec file — would otherwise fight
 * over the same metric names, and one app's numbers would show up in the other's scrape.
 *
 * Gauges throughout, including the edit total. `sf_room_revisions` is a sum over live rooms,
 * so it falls when a plan is deleted and is therefore not a counter, whatever its shape
 * suggests. That is the honest number: it is the edits that still exist.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name)
  private readonly registry = new Registry()

  private readonly roomsTotal: Gauge<'shared'>
  private readonly roomFactoriesTotal: Gauge<string>
  private readonly roomRevisions: Gauge<string>
  private readonly roomMembersTotal: Gauge<string>
  private readonly usersTotal: Gauge<string>
  private readonly wsConnections: Gauge<string>
  private readonly databaseUp: Gauge<string>

  private readonly activeClients: Gauge<'signed_in'>
  private readonly clientTabs: Gauge<'kind'>
  private readonly clientFactoriesTotal: Gauge<string>
  private readonly clientsByVersion: Gauge<'version'>
  private readonly clientsBySha: Gauge<'sha'>

  private readonly activeAccounts: Gauge<'window'>
  private readonly newAccounts: Gauge<'window'>
  private readonly signedInAccounts: Gauge<'window'>
  private readonly signInsTotal: Gauge<string>
  private readonly roomFactories: Gauge<'room_id' | 'owner'>
  private readonly userEdits: Gauge<'username'>
  private readonly userFactories: Gauge<'username'>

  private readonly sharesTotal: Gauge<string>
  private readonly shareOpensTotal: Gauge<string>
  private readonly newShares: Gauge<'window'>
  private readonly shareOpens: Gauge<'share_id'>

  private readonly roomActions: Gauge<'action'>
  private readonly newRooms: Gauge<'window'>
  private readonly newMemberships: Gauge<'window'>

  private readonly census: CachedQuery<TelemetrySnapshot>
  private readonly cheap: CachedQuery<CheapCounts>
  private readonly slow: CachedQuery<SlowStats>

  constructor (
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    @InjectModel(RoomMembership.name) private readonly memberships: Model<RoomMembership>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Share.name) private readonly shares: Model<Share>,
    private readonly connections: ConnectionRegistry,
    private readonly telemetry: TelemetryService,
    private readonly roomTotals: RoomTotalsService,
    private readonly counters: EventCountersService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    const registers = [this.registry]

    this.roomsTotal = new Gauge({
      name: 'sf_rooms_total',
      help: 'Synced tabs the server holds, excluding deleted ones, split by whether an invite link exists.',
      labelNames: ['shared'],
      registers,
    })
    this.roomFactoriesTotal = new Gauge({
      name: 'sf_room_factories_total',
      help: 'Factories summed across every live synced tab.',
      registers,
    })
    this.roomRevisions = new Gauge({
      name: 'sf_room_revisions',
      help: 'Accepted edits summed across live synced tabs. Falls when a tab is deleted, because those edits no longer exist, so it is a gauge and not a counter.',
      registers,
    })
    this.roomMembersTotal = new Gauge({
      name: 'sf_room_members_total',
      help: 'Person-to-tab access grants, owners included. One per tab plus one per extra collaborator.',
      registers,
    })
    this.usersTotal = new Gauge({
      name: 'sf_users_total',
      help: 'Registered accounts.',
      registers,
    })
    this.wsConnections = new Gauge({
      name: 'sf_ws_connections',
      help: 'Live realtime sockets. One connection carries every synced tab in a browser.',
      registers,
    })
    this.databaseUp = new Gauge({
      name: 'sf_metrics_database_up',
      help: '1 when the last scrape read the database. At 0 the database-backed gauges are stale, not zero.',
      registers,
    })

    this.activeClients = new Gauge({
      name: 'sf_active_clients',
      help: 'Browsers that sent a heartbeat inside the active window, by whether somebody is signed in.',
      labelNames: ['signed_in'],
      registers,
    })
    this.clientTabs = new Gauge({
      name: 'sf_client_tabs',
      help: 'Planner tabs summed across active browsers. Local tabs live only in that browser and the server cannot see them any other way.',
      labelNames: ['kind'],
      registers,
    })
    this.clientFactoriesTotal = new Gauge({
      name: 'sf_client_factories_total',
      help: 'Factories summed across active browsers, local tabs included.',
      registers,
    })
    this.clientsByVersion = new Gauge({
      name: 'sf_clients_by_version',
      help: 'Active browsers by the build they are running. Unrecognised versions count under "other".',
      labelNames: ['version'],
      registers,
    })

    this.clientsBySha = new Gauge({
      name: 'sf_clients_by_sha',
      help: 'Active browsers by the commit their bundle was built from. A build that reported no commit, such as a local one, counts under "unknown".',
      labelNames: ['sha'],
      registers,
    })
    this.activeAccounts = new Gauge({
      name: 'sf_active_accounts',
      help: 'Accounts whose last accepted edit falls inside the window. Signing in, creating a tab and joining one are not edits and do not count.',
      labelNames: ['window'],
      registers,
    })
    this.newAccounts = new Gauge({
      name: 'sf_new_accounts',
      help: 'Accounts registered inside the window. Read from the registration date the account already carries, so it is exact and works back over the whole history.',
      labelNames: ['window'],
      registers,
    })
    this.signedInAccounts = new Gauge({
      name: 'sf_signed_in_accounts',
      help: 'Accounts that signed in inside the window. Distinct from sf_active_accounts, which counts editing: signing in and changing nothing is a different thing.',
      labelNames: ['window'],
      registers,
    })
    this.signInsTotal = new Gauge({
      name: 'sf_signins_total',
      help: 'Sign-ins summed across accounts. Approximate: the count is written after the token is issued and is allowed to fail. Counts from release, and falls if an account is deleted.',
      registers,
    })
    this.roomFactories = new Gauge({
      name: 'sf_room_factories',
      help: `The ${METRICS_TOP_N} largest synced tabs by factory count.`,
      labelNames: ['room_id', 'owner'],
      registers,
    })
    this.userEdits = new Gauge({
      name: 'sf_user_edits',
      help: `The ${METRICS_TOP_N} busiest accounts by accepted edits. Approximate: the count is written after the edit commits and is allowed to fail. Starts from zero at release rather than being backfilled.`,
      labelNames: ['username'],
      registers,
    })
    this.userFactories = new Gauge({
      name: 'sf_user_factories',
      help: `The ${METRICS_TOP_N} accounts owning the most factories, summed over the synced tabs they created.`,
      labelNames: ['username'],
      registers,
    })

    this.sharesTotal = new Gauge({
      name: 'sf_shares_total',
      help: 'Snapshot share links that exist. Complete back to the feature shipping, since nothing purges the collection, and it falls only if a row is removed by hand.',
      registers,
    })
    this.shareOpensTotal = new Gauge({
      name: 'sf_share_opens_total',
      help: 'Snapshot link opens, summed across links. Counted when the link is fetched, which is the same moment the planner adds the tab.',
      registers,
    })
    this.newShares = new Gauge({
      name: 'sf_new_shares',
      help: 'Snapshot links created inside each rolling window. Retroactive: the creation date has always been stored.',
      labelNames: ['window'],
      registers,
    })
    this.shareOpens = new Gauge({
      name: 'sf_share_opens',
      help: `The ${METRICS_TOP_N} most-opened snapshot links.`,
      labelNames: ['share_id'],
      registers,
    })

    this.roomActions = new Gauge({
      name: 'sf_room_actions_total',
      help: 'Room lifecycle events that have ever happened, by kind: rooms created, rooms shared, invites accepted, and the rest. Only ever rises, and survives the room being deleted. Counts from this metric shipping rather than being backfilled, because the activity log it would have been read from is trimmed and purged. Excludes `op`, which sf_room_revisions already sums.',
      labelNames: ['action'],
      registers,
    })
    this.newRooms = new Gauge({
      name: 'sf_new_rooms',
      help: 'Rooms created inside each rolling window, counted from the room documents. Retroactive, so it is answerable immediately, but it sees only rooms that still exist: a room deleted inside the window is not in it.',
      labelNames: ['window'],
      registers,
    })
    this.newMemberships = new Gauge({
      name: 'sf_new_memberships',
      help: 'Invites accepted inside each rolling window, counted from the membership rows. Retroactive like sf_new_rooms, and with the same caveat: someone who joined and then left, or was dropped by an unshare, is not in it.',
      labelNames: ['window'],
      registers,
    })

    // The census is a database read now too, so it gets the same last-good-value
    // treatment: a Mongo outage must not blank the client panels either.
    this.census = new CachedQuery(METRICS_CACHE_MS, () => this.telemetry.snapshot())
    this.cheap = new CachedQuery(METRICS_CACHE_MS, () => this.loadCheap())
    this.slow = new CachedQuery(METRICS_SLOW_CACHE_MS, () => this.loadSlow())
  }

  get contentType (): string {
    return this.registry.contentType
  }

  async render (): Promise<string> {
    await this.refresh()
    // The counters live in their own registry, owned by a service that depends on nothing, so
    // that the modules reporting faults do not have to import this one. Merging is how the two
    // arrive in a single scrape.
    return Registry.merge([this.registry, this.counters.registry]).metrics()
  }

  private async refresh (): Promise<void> {
    // Free, so never cached: both come from memory this process already holds.
    this.wsConnections.set(this.connections.size())

    const nowMs = this.clock.now().getTime()
    const [census, cheap, slow] = await Promise.all([
      this.census.get(nowMs),
      this.cheap.get(nowMs),
      this.slow.get(nowMs),
    ])

    if (census.value) this.setClientGauges(census.value)

    // Either group failing means the database was unreadable this scrape. A 500 would cost
    // Prometheus every series here, the in-memory ones included, so the outage is reported
    // as a signal and the last good values stand.
    this.databaseUp.set(census.failed || cheap.failed || slow.failed ? 0 : 1)

    if (cheap.value) {
      this.roomsTotal.set({ shared: 'true' }, cheap.value.sharedRooms)
      this.roomsTotal.set({ shared: 'false' }, cheap.value.privateRooms)
      this.roomFactoriesTotal.set(cheap.value.roomFactories)
      this.roomRevisions.set(cheap.value.roomRevisions)
      this.roomMembersTotal.set(cheap.value.roomMembers)
      this.usersTotal.set(cheap.value.users)
      this.signInsTotal.set(cheap.value.signIns)
      this.sharesTotal.set(cheap.value.shares)
      this.shareOpensTotal.set(cheap.value.shareOpens)

      this.setRoomActionGauges(cheap.value.roomActions)
    }

    // Only on a real reload. prom-client remembers every label set it has been given, so a
    // room or account that has dropped out of the top N would keep reporting its last value
    // forever unless the gauge is cleared first. Equally, a failed reload must leave the
    // previous set intact rather than blanking the panel.
    if (slow.refreshed && slow.value) this.setSlowGauges(slow.value)
  }

  /**
   * Every kind is exported, whether or not it has ever happened. prom-client emits a series
   * only once it has been set, so a kind nobody has done yet would be absent entirely and
   * its panel would read "No data" rather than a green zero — which is what the tally said
   * on release, when nothing had been counted at all.
   *
   * Not reset first: the tally only rises and a kind never leaves it, so unlike the top-N
   * gauges there is no stale label set to clear.
   */
  private setRoomActionGauges (stored: Map<string, number>): void {
    // Seeded first, then overlaid, so a kind held in the database but no longer in the enum
    // still reports rather than being silently dropped.
    const actions = new Map<string, number>(
      ROOM_ACTIVITY_KINDS.filter(kind => kind !== 'op').map(kind => [kind, 0]),
    )
    for (const [action, count] of stored) actions.set(action, count)

    for (const [action, count] of actions) this.roomActions.set({ action }, count)
  }

  private setClientGauges (census: TelemetrySnapshot): void {
    this.activeClients.set({ signed_in: 'true' }, census.activeSignedIn)
    this.activeClients.set({ signed_in: 'false' }, census.activeSignedOut)
    this.clientTabs.set({ kind: 'local' }, census.localTabs)
    this.clientTabs.set({ kind: 'cloud' }, census.cloudTabs)
    this.clientFactoriesTotal.set(census.factories)

    this.clientsByVersion.reset()
    for (const [version, clients] of census.byVersion) {
      this.clientsByVersion.set({ version }, clients)
    }

    this.clientsBySha.reset()
    for (const [sha, clients] of census.bySha) {
      this.clientsBySha.set({ sha }, clients)
    }
  }

  private setSlowGauges (stats: SlowStats): void {
    for (const [window, accounts] of stats.activeAccounts) {
      this.activeAccounts.set({ window }, accounts)
    }
    for (const [window, accounts] of stats.newAccounts) {
      this.newAccounts.set({ window }, accounts)
    }
    for (const [window, accounts] of stats.signedInAccounts) {
      this.signedInAccounts.set({ window }, accounts)
    }

    this.roomFactories.reset()
    for (const room of stats.topRooms) {
      this.roomFactories.set({ room_id: room.roomId, owner: room.owner }, room.factories)
    }

    this.userEdits.reset()
    for (const editor of stats.topEditors) {
      this.userEdits.set({ username: editor.name }, editor.value)
    }

    this.userFactories.reset()
    for (const owner of stats.topOwners) {
      this.userFactories.set({ username: owner.name }, owner.value)
    }

    for (const [window, shares] of stats.newShares) {
      this.newShares.set({ window }, shares)
    }

    this.shareOpens.reset()
    for (const share of stats.topShares) {
      this.shareOpens.set({ share_id: share.shareId }, share.opens)
    }

    for (const [window, rooms] of stats.newRooms) {
      this.newRooms.set({ window }, rooms)
    }
    for (const [window, memberships] of stats.newMemberships) {
      this.newMemberships.set({ window }, memberships)
    }
  }

  private async loadCheap (): Promise<CheapCounts> {
    const [sharedRooms, privateRooms, totals, roomMembers, users, signIns, shares, shareOpens, roomActions] =
      await Promise.all([
        this.rooms.countDocuments({ deletedAt: null, shared: true }),
        // `$ne: true` rather than `false`, so a document predating the field still counts
        // once rather than not at all.
        this.rooms.countDocuments({ deletedAt: null, shared: { $ne: true } }),
        this.sumRoomTotals(),
        this.memberships.countDocuments(),
        this.users.countDocuments(),
        this.sumSignIns(),
        this.shares.countDocuments(),
        this.sumShareOpens(),
        this.roomTotals.all(),
      ])

    return {
      sharedRooms, privateRooms, ...totals, roomMembers, users, signIns, shares, shareOpens, roomActions,
    }
  }

  private async loadSlow (): Promise<SlowStats> {
    const now = this.clock.now()
    const [
      activeAccounts, newAccounts, signedInAccounts, topRooms, topEditors, topOwners, newShares, topShares,
      newRooms, newMemberships,
    ] =
      await Promise.all([
        this.countByWindow(now, since => this.users.countDocuments({ lastActiveAt: { $gt: since } })),
        this.countByWindow(now, since => this.users.countDocuments({ registered: { $gt: since } })),
        this.countByWindow(now, since => this.users.countDocuments({ lastSignInAt: { $gt: since } })),
        this.findLargestRooms(),
        this.findBusiestEditors(),
        this.findLargestOwners(),
        this.countByWindow(now, since => this.shares.countDocuments({ created: { $gt: since } })),
        this.findMostOpenedShares(),
        this.countByWindow(now, since => this.rooms.countDocuments({ createdAt: { $gt: since } })),
        // Owners are excluded: the owner's row is written by the create, so counting it
        // would report every new room as an invite somebody accepted.
        this.countByWindow(now, since =>
          this.memberships.countDocuments({ role: 'member', joinedAt: { $gt: since } })),
      ])

    return {
      activeAccounts, newAccounts, signedInAccounts, topRooms, topEditors, topOwners, newShares, topShares,
      newRooms, newMemberships,
    }
  }

  /** Factories and accepted edits in one pass, since both are sums over the same documents. */
  private async sumRoomTotals (): Promise<{ roomFactories: number, roomRevisions: number }> {
    const [row] = await this.rooms.aggregate<{ factories: number, revisions: number }>([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: null,
          factories: { $sum: { $size: { $ifNull: ['$factories', []] } } },
          revisions: { $sum: { $ifNull: ['$revision', 0] } },
        },
      },
    ])
    return { roomFactories: row?.factories ?? 0, roomRevisions: row?.revisions ?? 0 }
  }

  /** Sign-ins across all accounts. Falls if an account is deleted, like the edit total. */
  private async sumSignIns (): Promise<number> {
    const [row] = await this.users.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: { $ifNull: ['$signInCount', 0] } } } },
    ])
    return row?.total ?? 0
  }

  /**
   * Opens across every link. `views` is bumped by `GET /share/:id`, which the planner calls
   * immediately before adding the tab, so this counts links actually opened into a plan.
   */
  private async sumShareOpens (): Promise<number> {
    const [row] = await this.shares.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: { $ifNull: ['$views', 0] } } } },
    ])
    return row?.total ?? 0
  }

  /** Tie-broken on the id, so equally popular links do not swap places between scrapes. */
  private async findMostOpenedShares (): Promise<ShareTotal[]> {
    const rows = await this.shares
      .find({ views: { $gt: 0 } }, { id: 1, views: 1 })
      .sort({ views: -1, id: 1 })
      .limit(METRICS_TOP_N)
      .lean()

    return rows.map(row => ({ shareId: row.id, opens: row.views }))
  }

  /**
   * One rolling-window count per configured window, for whatever the caller counts.
   * A timestamp rather than a bucket, so every window is exact with no boundary error, and
   * most of the fields need no new writes at all: accounts have carried `registered` and
   * shares their creation date since the beginning, so these windows are true retroactively.
   */
  private async countByWindow (
    now: Date,
    count: (since: Date) => Promise<number>,
  ): Promise<Array<readonly [string, number]>> {
    return Promise.all(ACTIVE_ACCOUNT_WINDOWS.map(async ([label, ms]) => {
      const matched = await count(new Date(now.getTime() - ms))
      return [label, matched] as const
    }))
  }

  /** Sorted by size then by id, so equal-sized rooms do not swap places between scrapes. */
  private async findLargestRooms (): Promise<RoomTotal[]> {
    const rows = await this.rooms.aggregate<{ roomId: string, createdBy: string, factories: number }>([
      { $match: { deletedAt: null } },
      {
        $project: {
          roomId: 1,
          createdBy: 1,
          factories: { $size: { $ifNull: ['$factories', []] } },
        },
      },
      { $sort: { factories: -1, roomId: 1 } },
      { $limit: METRICS_TOP_N },
    ])

    const owners = await this.resolveUsernames(rows.map(row => row.createdBy))
    return rows.map(row => ({
      roomId: row.roomId,
      owner: owners.get(row.createdBy) ?? DELETED_OWNER,
      factories: row.factories,
    }))
  }

  private async findBusiestEditors (): Promise<OwnedTotal[]> {
    const rows = await this.users
      .find({ editCount: { $gt: 0 } }, { username: 1, editCount: 1 })
      .sort({ editCount: -1, _id: 1 })
      .limit(METRICS_TOP_N)
      .lean()

    return rows.map(row => ({ name: row.username, value: row.editCount }))
  }

  private async findLargestOwners (): Promise<OwnedTotal[]> {
    const rows = await this.rooms.aggregate<{ _id: string, factories: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: '$createdBy', factories: { $sum: { $size: { $ifNull: ['$factories', []] } } } } },
      { $sort: { factories: -1, _id: 1 } },
      { $limit: METRICS_TOP_N },
    ])

    const owners = await this.resolveUsernames(rows.map(row => row._id))
    return rows.map(row => ({ name: owners.get(row._id) ?? DELETED_OWNER, value: row.factories }))
  }

  /**
   * `Room.createdBy` holds a user id, not a username, so the top-N rows have to be joined
   * back to accounts. Ids that are not valid ObjectIds are skipped rather than passed to
   * Mongo, which would throw a cast error and fail the whole scrape over one bad row.
   */
  private async resolveUsernames (ids: string[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids)].filter(id => Types.ObjectId.isValid(id))
    if (valid.length === 0) return new Map()

    const accounts = await this.users.find({ _id: { $in: valid } }, { username: 1 }).lean()
    return new Map(accounts.map(account => [String(account._id), account.username]))
  }
}
