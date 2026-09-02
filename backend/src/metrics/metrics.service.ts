import { Gauge, Registry } from 'prom-client'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

import { CLOCK, Clock } from '../rooms/clock'
import { ConnectionRegistry } from '../realtime/connection-registry'
import { METRICS_CACHE_MS } from './metrics.constants'
import { Room } from '../rooms/schemas/room.schema'
import { RoomMembership } from '../rooms/schemas/room-membership.schema'
import { TelemetryService } from './telemetry.service'
import { User } from '../auth/user.schema'

/** The five numbers that cost a database round trip, and are therefore cached together. */
interface DatabaseCounts {
  sharedRooms: number
  privateRooms: number
  roomFactories: number
  roomMembers: number
  users: number
}

const ZERO_COUNTS: DatabaseCounts = {
  sharedRooms: 0,
  privateRooms: 0,
  roomFactories: 0,
  roomMembers: 0,
  users: 0,
}

/**
 * Everything `GET /metrics` serves.
 *
 * The registry is created per instance rather than using prom-client's default global one.
 * Two Nest apps in one process — which is every backend spec file — would otherwise fight
 * over the same metric names, and one app's numbers would show up in the other's scrape.
 *
 * Gauges throughout. Every one of these is a level that can go down as well as up (rooms
 * are deleted, clients go away), which is what separates a gauge from a counter; nothing
 * here is a monotonic event tally.
 */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry()

  private readonly roomsTotal: Gauge<'shared'>
  private readonly roomFactoriesTotal: Gauge<string>
  private readonly roomMembersTotal: Gauge<string>
  private readonly usersTotal: Gauge<string>
  private readonly wsConnections: Gauge<string>
  private readonly databaseUp: Gauge<string>

  private readonly activeClients: Gauge<'signed_in'>
  private readonly clientTabs: Gauge<'kind'>
  private readonly clientFactoriesTotal: Gauge<string>
  private readonly clientsByVersion: Gauge<'version'>

  private cached: DatabaseCounts = ZERO_COUNTS
  private cachedAtMs = 0
  private everRead = false

  constructor (
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    @InjectModel(RoomMembership.name) private readonly memberships: Model<RoomMembership>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly connections: ConnectionRegistry,
    private readonly telemetry: TelemetryService,
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
    this.roomMembersTotal = new Gauge({
      name: 'sf_room_members_total',
      help: 'Membership rows across all synced tabs, owners included. The sweeper deletes a room\'s rows with it.',
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
      help: '1 when the last scrape read the database. At 0 the sf_rooms/members/users gauges are stale, not zero.',
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
  }

  get contentType (): string {
    return this.registry.contentType
  }

  async render (): Promise<string> {
    await this.refresh()
    return this.registry.metrics()
  }

  private async refresh (): Promise<void> {
    // Free, so never cached: both come from memory this process already holds.
    this.wsConnections.set(this.connections.size())
    this.setClientGauges()

    const counts = await this.databaseCounts()
    if (!counts) return

    this.roomsTotal.set({ shared: 'true' }, counts.sharedRooms)
    this.roomsTotal.set({ shared: 'false' }, counts.privateRooms)
    this.roomFactoriesTotal.set(counts.roomFactories)
    this.roomMembersTotal.set(counts.roomMembers)
    this.usersTotal.set(counts.users)
  }

  private setClientGauges (): void {
    const census = this.telemetry.snapshot()

    this.activeClients.set({ signed_in: 'true' }, census.activeSignedIn)
    this.activeClients.set({ signed_in: 'false' }, census.activeSignedOut)
    this.clientTabs.set({ kind: 'local' }, census.localTabs)
    this.clientTabs.set({ kind: 'cloud' }, census.cloudTabs)
    this.clientFactoriesTotal.set(census.factories)

    // Reset first: a version nobody runs any more would otherwise keep reporting its last
    // count for the life of the process, because prom-client remembers every label set it
    // has been given.
    this.clientsByVersion.reset()
    for (const [version, clients] of census.byVersion) {
      this.clientsByVersion.set({ version }, clients)
    }
  }

  /**
   * Cached, and on a database failure the previous answer stands rather than the scrape
   * failing. A 500 here would cost Prometheus every metric on the endpoint, including the
   * client ones that were still perfectly readable — so the outage is reported as
   * `sf_metrics_database_up 0` instead, which is a signal rather than a gap. Returns null
   * when there is nothing new to write.
   */
  private async databaseCounts (): Promise<DatabaseCounts | null> {
    const nowMs = this.clock.now().getTime()
    if (this.everRead && nowMs - this.cachedAtMs < METRICS_CACHE_MS) return null

    try {
      const [sharedRooms, privateRooms, roomFactories, roomMembers, users] = await Promise.all([
        this.rooms.countDocuments({ deletedAt: null, shared: true }),
        // `$ne: true` rather than `false`, so a document predating the field still counts
        // once rather than not at all.
        this.rooms.countDocuments({ deletedAt: null, shared: { $ne: true } }),
        this.sumRoomFactories(),
        this.memberships.countDocuments(),
        this.users.countDocuments(),
      ])

      this.cached = { sharedRooms, privateRooms, roomFactories, roomMembers, users }
      this.cachedAtMs = nowMs
      this.everRead = true
      this.databaseUp.set(1)
      return this.cached
    } catch (error) {
      console.error(`Metrics database read failed: ${error instanceof Error ? error.message : String(error)}`)
      this.databaseUp.set(0)
      // Nothing on the first failure: reporting zero rooms would read as an empty
      // database rather than an unreachable one.
      return this.everRead ? this.cached : null
    }
  }

  private async sumRoomFactories (): Promise<number> {
    const [row] = await this.rooms.aggregate<{ total: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: null, total: { $sum: { $size: { $ifNull: ['$factories', []] } } } } },
    ])
    return row?.total ?? 0
  }
}
