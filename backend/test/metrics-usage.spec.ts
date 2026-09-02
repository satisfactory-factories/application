import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getModelToken } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

import {
  ACTIVE_ACCOUNT_WINDOWS,
  DELETED_OWNER,
  METRICS_SLOW_CACHE_MS,
  METRICS_TOP_N,
} from '../src/metrics/metrics.constants'
import { ANONYMOUS_ACTOR, UserActivityService } from '../src/user-activity/user-activity.service'
import { Room } from '../src/rooms/schemas/room.schema'
import { Share } from '../src/legacy/share.schema'
import { RoomActivity } from '../src/rooms/schemas/room-activity.schema'
import { RoomOpService } from '../src/realtime/room-op.service'
import { TestContext, awaitConnection, createTestApp, destroyTestApp } from './utils/test-app'
import { User } from '../src/auth/user.schema'
import { FakeClock, call, registerAndLogin, resetRooms } from './utils/rooms'
import { clearMetricsToken, labelValues, sample, scrapeMetrics, useMetricsToken } from './utils/metrics'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('the database-backed usage metrics', () => {
  let context: TestContext
  const clock = new FakeClock()

  const rooms = () => context.app.get<Model<Room>>(getModelToken(Room.name))
  const users = () => context.app.get<Model<User>>(getModelToken(User.name))

  const seedUser = async (username: string, extra: Partial<User> = {}) =>
    users().create({ username, password: 'hashed', ...extra })

  const seedRoom = async (factories: number, overrides: Partial<Room> = {}) =>
    rooms().create({
      roomId: randomUUID(),
      name: 'Iron Line',
      createdBy: 'someone',
      factories: Array.from({ length: factories }, (_unused, index) => ({ id: index })),
      ...overrides,
    })

  /** Past both cache windows every time, so each case reads what it just seeded. */
  const scrape = async (): Promise<string> => {
    clock.advance(METRICS_SLOW_CACHE_MS + 1)
    const response = await scrapeMetrics(context.app)
    expect(response.status).toBe(200)
    return response.text
  }

  beforeAll(async () => {
    context = await createTestApp({ clock, unthrottled: true })
    await awaitConnection(context.app)
    useMetricsToken()
  })

  afterAll(async () => {
    await destroyTestApp(context)
    clearMetricsToken()
  })

  // Forward only: winding the clock back would put a previous case's cache stamp in the future.
  beforeEach(async () => {
    await resetRooms(context.app)
  })

  describe('sf_room_revisions', () => {
    it('sums accepted edits across live rooms', async () => {
      await seedRoom(2, { revision: 30 })
      await seedRoom(1, { revision: 12 })

      expect(sample(await scrape(), 'sf_room_revisions')).toBe(42)
    })

    it('treats a room with no revision field as zero rather than skipping it', async () => {
      await seedRoom(1, { revision: 5 })
      await rooms().collection.insertOne({ roomId: randomUUID(), name: 'Old', createdBy: 'x', factories: [], deletedAt: null })

      expect(sample(await scrape(), 'sf_room_revisions')).toBe(5)
    })

    // Documented behaviour, not a defect: those edits no longer exist. It is why this is a
    // gauge, and why the dashboard clamps the 24h difference at zero.
    it('falls when a room is deleted, which is why it is not a counter', async () => {
      const doomed = await seedRoom(1, { revision: 40 })
      await seedRoom(1, { revision: 4 })
      expect(sample(await scrape(), 'sf_room_revisions')).toBe(44)

      await rooms().deleteOne({ roomId: doomed.roomId })

      expect(sample(await scrape(), 'sf_room_revisions')).toBe(4)
    })

    it('reports zero rather than nothing on an empty database', async () => {
      expect(sample(await scrape(), 'sf_room_revisions')).toBe(0)
    })
  })

  describe('sf_active_accounts', () => {
    it('counts an account in every window wider than its last edit', async () => {
      const now = clock.now().getTime()
      await seedUser('recent', { lastActiveAt: new Date(now - 30 * 60 * 1000) })
      await seedUser('yesterday', { lastActiveAt: new Date(now - 20 * HOUR) })
      await seedUser('lastweek', { lastActiveAt: new Date(now - 6 * DAY) })
      await seedUser('ancient', { lastActiveAt: new Date(now - 200 * DAY) })
      await seedUser('never')

      const body = await scrape()

      // The clock advanced inside scrape(), so each boundary has moved a little; the
      // orderings below hold regardless.
      expect(sample(body, 'sf_active_accounts', 'window="1h"')).toBe(1)
      expect(sample(body, 'sf_active_accounts', 'window="24h"')).toBe(2)
      expect(sample(body, 'sf_active_accounts', 'window="7d"')).toBe(3)
      expect(sample(body, 'sf_active_accounts', 'window="30d"')).toBe(3)
    })

    it('exports every configured window, even at zero', async () => {
      const body = await scrape()

      for (const [label] of ACTIVE_ACCOUNT_WINDOWS) {
        expect(sample(body, 'sf_active_accounts', `window="${label}"`)).toBe(0)
      }
    })

    it('never counts an account that has only ever signed in', async () => {
      await seedUser('lurker')

      expect(sample(await scrape(), 'sf_active_accounts', 'window="30d"')).toBe(0)
    })
  })

  describe('sf_new_accounts', () => {
    // No new writes for this one: User.registered has always been there, so the windows
    // are correct for every account that already existed before the metric did.
    it('counts registrations in each rolling window', async () => {
      const now = clock.now().getTime()
      await seedUser('today', { registered: new Date(now - 2 * HOUR) })
      await seedUser('thisweek', { registered: new Date(now - 4 * DAY) })
      await seedUser('thismonth', { registered: new Date(now - 20 * DAY) })
      await seedUser('ancient', { registered: new Date(now - 300 * DAY) })

      const body = await scrape()

      expect(sample(body, 'sf_new_accounts', 'window="24h"')).toBe(1)
      expect(sample(body, 'sf_new_accounts', 'window="7d"')).toBe(2)
      expect(sample(body, 'sf_new_accounts', 'window="30d"')).toBe(3)
    })

    it('exports every window even with no accounts at all', async () => {
      const body = await scrape()

      for (const [label] of ACTIVE_ACCOUNT_WINDOWS) {
        expect(sample(body, 'sf_new_accounts', `window="${label}"`)).toBe(0)
      }
    })

    it('counts an account that registered but never signed in or edited', async () => {
      await seedUser('signed-up-only', { registered: clock.now() })

      const body = await scrape()

      expect(sample(body, 'sf_new_accounts', 'window="24h"')).toBe(1)
      expect(sample(body, 'sf_active_accounts', 'window="24h"')).toBe(0)
      expect(sample(body, 'sf_signed_in_accounts', 'window="24h"')).toBe(0)
    })
  })

  describe('sf_signed_in_accounts and sf_signins_total', () => {
    it('counts sign-ins in each rolling window', async () => {
      const now = clock.now().getTime()
      await seedUser('today', { lastSignInAt: new Date(now - 2 * HOUR) })
      await seedUser('lastweek', { lastSignInAt: new Date(now - 5 * DAY) })
      await seedUser('never')

      const body = await scrape()

      expect(sample(body, 'sf_signed_in_accounts', 'window="24h"')).toBe(1)
      expect(sample(body, 'sf_signed_in_accounts', 'window="7d"')).toBe(2)
      expect(sample(body, 'sf_signed_in_accounts', 'window="30d"')).toBe(2)
    })

    it('sums sign-ins across accounts', async () => {
      await seedUser('one', { signInCount: 12 })
      await seedUser('two', { signInCount: 3 })
      await seedUser('three')

      expect(sample(await scrape(), 'sf_signins_total')).toBe(15)
    })

    // Signing in and changing nothing is a real thing people do, and conflating the two
    // would overstate how many accounts are actually building something.
    it('is separate from editing', async () => {
      const now = clock.now()
      await seedUser('reader', { lastSignInAt: now })
      await seedUser('builder', { lastActiveAt: now, lastSignInAt: now })

      const body = await scrape()

      expect(sample(body, 'sf_signed_in_accounts', 'window="24h"')).toBe(2)
      expect(sample(body, 'sf_active_accounts', 'window="24h"')).toBe(1)
    })
  })

  describe('sf_room_factories, the largest plans', () => {
    it('names the biggest rooms and resolves the owner to a username', async () => {
      const owner = await seedUser('mael')
      const big = await seedRoom(40, { createdBy: String(owner._id) })
      await seedRoom(3, { createdBy: String(owner._id) })

      const body = await scrape()

      expect(sample(body, 'sf_room_factories', `room_id="${big.roomId}",owner="mael"`)).toBe(40)
    })

    it('labels an owner who no longer exists rather than dropping the room', async () => {
      const room = await seedRoom(9, { createdBy: '507f1f77bcf86cd799439011' })

      const body = await scrape()

      expect(sample(body, 'sf_room_factories', `room_id="${room.roomId}",owner="${DELETED_OWNER}"`)).toBe(9)
    })

    // A cast error on one bad row must not take the whole scrape down.
    it('survives a createdBy that is not an object id at all', async () => {
      const room = await seedRoom(4, { createdBy: 'not-an-object-id' })

      const body = await scrape()

      expect(sample(body, 'sf_room_factories', `room_id="${room.roomId}",owner="${DELETED_OWNER}"`)).toBe(4)
    })

    it(`exports at most ${METRICS_TOP_N} rooms however many exist`, async () => {
      for (let index = 0; index < METRICS_TOP_N + 8; index++) await seedRoom(index + 1)

      const labels = labelValues(await scrape(), 'sf_room_factories', 'room_id')

      expect(labels.length).toBe(METRICS_TOP_N)
    })

    it('drops a room that has fallen out of the top N', async () => {
      const small = await seedRoom(1)
      expect(sample(await scrape(), 'sf_room_factories', `room_id="${small.roomId}",owner="${DELETED_OWNER}"`)).toBe(1)

      for (let index = 0; index < METRICS_TOP_N; index++) await seedRoom(50 + index)

      const body = await scrape()
      expect(sample(body, 'sf_room_factories', `room_id="${small.roomId}",owner="${DELETED_OWNER}"`)).toBeUndefined()
    })

    it('breaks ties on room id, so equal rooms keep their order between scrapes', async () => {
      for (let index = 0; index < METRICS_TOP_N + 5; index++) await seedRoom(7)

      const first = labelValues(await scrape(), 'sf_room_factories', 'room_id')
      const second = labelValues(await scrape(), 'sf_room_factories', 'room_id')

      expect(first).toEqual(second)
    })
  })

  describe('the share link metrics', () => {
    const shares = () => context.app.get<Model<Share>>(getModelToken(Share.name))

    let minted = 0
    const seedShare = async (overrides: Partial<Share> = {}) =>
      shares().create({
        id: `link-${minted++}`,
        data: '[]',
        createdBy: 'Anonymous',
        ...overrides,
      })

    // resetRooms leaves the shares collection alone, since every other suite owns its own.
    beforeEach(async () => {
      await shares().deleteMany({})
    })

    it('counts the links that exist, and the opens summed across them', async () => {
      await seedShare({ views: 3 })
      await seedShare({ views: 11 })
      await seedShare()

      const body = await scrape()

      expect(sample(body, 'sf_shares_total')).toBe(3)
      expect(sample(body, 'sf_share_opens_total')).toBe(14)
    })

    it('reads a row predating the view counter as zero rather than failing', async () => {
      await shares().collection.insertOne({ id: 'ancient', data: '[]', createdBy: 'Anonymous' })

      const body = await scrape()

      expect(sample(body, 'sf_shares_total')).toBe(1)
      expect(sample(body, 'sf_share_opens_total')).toBe(0)
    })

    it('reports zero for both when no link has ever been made', async () => {
      const body = await scrape()

      expect(sample(body, 'sf_shares_total')).toBe(0)
      expect(sample(body, 'sf_share_opens_total')).toBe(0)
    })

    // Retroactive, like sf_new_accounts: the creation date has always been stored, so these
    // windows are correct for every link made before the metric existed.
    it('counts links created in each rolling window', async () => {
      const now = clock.now().getTime()
      await seedShare({ created: new Date(now - 2 * HOUR) })
      await seedShare({ created: new Date(now - 4 * DAY) })
      await seedShare({ created: new Date(now - 20 * DAY) })
      await seedShare({ created: new Date(now - 300 * DAY) })

      const body = await scrape()

      expect(sample(body, 'sf_new_shares', 'window="24h"')).toBe(1)
      expect(sample(body, 'sf_new_shares', 'window="7d"')).toBe(2)
      expect(sample(body, 'sf_new_shares', 'window="30d"')).toBe(3)
    })

    it('exports every window even with no links at all', async () => {
      const body = await scrape()

      for (const [label] of ACTIVE_ACCOUNT_WINDOWS) {
        expect(sample(body, 'sf_new_shares', `window="${label}"`)).toBe(0)
      }
    })

    it('names the most-opened links', async () => {
      await seedShare({ id: 'popular-copper-belt', views: 42 })
      await seedShare({ id: 'quiet-iron-rod', views: 1 })

      const body = await scrape()

      expect(sample(body, 'sf_share_opens', 'share_id="popular-copper-belt"')).toBe(42)
      expect(sample(body, 'sf_share_opens', 'share_id="quiet-iron-rod"')).toBe(1)
    })

    it('leaves a never-opened link out of the top N rather than listing it at zero', async () => {
      await seedShare({ id: 'never-opened', views: 0 })

      expect(sample(await scrape(), 'sf_share_opens', 'share_id="never-opened"')).toBeUndefined()
    })

    it(`exports at most ${METRICS_TOP_N} links however many exist`, async () => {
      for (let index = 0; index < METRICS_TOP_N + 8; index++) await seedShare({ views: index + 1 })

      expect(labelValues(await scrape(), 'sf_share_opens', 'share_id').length).toBe(METRICS_TOP_N)
    })

    it('drops a link that has fallen out of the top N', async () => {
      await seedShare({ id: 'one-open', views: 1 })
      expect(sample(await scrape(), 'sf_share_opens', 'share_id="one-open"')).toBe(1)

      for (let index = 0; index < METRICS_TOP_N; index++) await seedShare({ views: 50 + index })

      expect(sample(await scrape(), 'sf_share_opens', 'share_id="one-open"')).toBeUndefined()
    })

    it('breaks ties on the link id, so equal links keep their order between scrapes', async () => {
      for (let index = 0; index < METRICS_TOP_N + 5; index++) await seedShare({ views: 7 })

      expect(labelValues(await scrape(), 'sf_share_opens', 'share_id'))
        .toEqual(labelValues(await scrape(), 'sf_share_opens', 'share_id'))
    })

    /**
     * The whole chain, since the count is a side effect of a route nothing else asserts
     * against the metrics: opening the link is what moves the number.
     */
    it('rises when a link is actually opened', async () => {
      await seedShare({ id: 'opened-for-real', views: 0 })

      await call(context.app, 'get', '/share/opened-for-real')
      await call(context.app, 'get', '/share/opened-for-real')

      const body = await scrape()
      expect(sample(body, 'sf_share_opens', 'share_id="opened-for-real"')).toBe(2)
      expect(sample(body, 'sf_share_opens_total')).toBe(2)
    })
  })

  describe('sf_user_edits and sf_user_factories', () => {
    it('ranks the busiest editors', async () => {
      await seedUser('busy', { editCount: 120 })
      await seedUser('quiet', { editCount: 3 })
      await seedUser('idle')

      const body = await scrape()

      expect(sample(body, 'sf_user_edits', 'username="busy"')).toBe(120)
      expect(sample(body, 'sf_user_edits', 'username="quiet"')).toBe(3)
      // Never edited, so absent rather than a zero series taking up space.
      expect(sample(body, 'sf_user_edits', 'username="idle"')).toBeUndefined()
    })

    it('sums factories across the rooms an account owns', async () => {
      const owner = await seedUser('builder')
      await seedRoom(10, { createdBy: String(owner._id) })
      await seedRoom(15, { createdBy: String(owner._id) })

      expect(sample(await scrape(), 'sf_user_factories', 'username="builder"')).toBe(25)
    })

    it(`caps both at ${METRICS_TOP_N}`, async () => {
      for (let index = 0; index < METRICS_TOP_N + 6; index++) {
        const owner = await seedUser(`user-${index}`, { editCount: index + 1 })
        await seedRoom(index + 1, { createdBy: String(owner._id) })
      }

      const body = await scrape()

      expect(labelValues(body, 'sf_user_edits', 'username').length).toBe(METRICS_TOP_N)
      expect(labelValues(body, 'sf_user_factories', 'username').length).toBe(METRICS_TOP_N)
    })

    it('stops exporting an editor who has fallen out of the top N', async () => {
      await seedUser('early', { editCount: 1 })
      expect(sample(await scrape(), 'sf_user_edits', 'username="early"')).toBe(1)

      for (let index = 0; index < METRICS_TOP_N; index++) {
        await seedUser(`louder-${index}`, { editCount: 100 + index })
      }

      expect(sample(await scrape(), 'sf_user_edits', 'username="early"')).toBeUndefined()
    })
  })
})

describe('UserActivityService', () => {
  let context: TestContext
  const clock = new FakeClock()

  const users = () => context.app.get<Model<User>>(getModelToken(User.name))
  const activity = () => context.app.get<Model<RoomActivity>>(getModelToken(RoomActivity.name))
  const service = () => context.app.get(UserActivityService)

  const seedUser = async (username: string, extra: Partial<User> = {}) =>
    users().create({ username, password: 'hashed', ...extra })

  const reload = async (id: unknown) => users().findById(id).lean()

  beforeAll(async () => {
    context = await createTestApp({ clock, unthrottled: true })
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    await resetRooms(context.app)
  })

  describe('recordEdit', () => {
    it('stamps the timestamp and counts the edit', async () => {
      const user = await seedUser('editor')
      const at = new Date('2026-09-02T10:00:00Z')

      await service().recordEdit(String(user._id), at)

      const stored = await reload(user._id)
      expect(stored?.lastActiveAt?.toISOString()).toBe(at.toISOString())
      expect(stored?.editCount).toBe(1)
    })

    /**
     * The reason the field uses `$max`. Ops queue per room, not per account, so one person
     * editing two rooms has no global ordering and the earlier op's write can land last.
     */
    it('never moves lastActiveAt backwards', async () => {
      const user = await seedUser('editor')
      const later = new Date('2026-09-02T12:00:00Z')
      const earlier = new Date('2026-09-02T09:00:00Z')

      await service().recordEdit(String(user._id), later)
      await service().recordEdit(String(user._id), earlier)

      const stored = await reload(user._id)
      expect(stored?.lastActiveAt?.toISOString()).toBe(later.toISOString())
      // The out-of-order write still counts as an edit; only the date is clamped.
      expect(stored?.editCount).toBe(2)
    })

    it('ignores anonymous visitors, who have no account to stamp', async () => {
      await expect(service().recordEdit(ANONYMOUS_ACTOR, new Date())).resolves.toBeUndefined()
    })
  })

  describe('recordSignIn', () => {
    it('stamps the sign-in and counts it', async () => {
      const user = await seedUser('returning')
      const at = new Date('2026-09-02T10:00:00Z')

      await service().recordSignIn(String(user._id), at)

      const stored = await reload(user._id)
      expect(stored?.lastSignInAt?.toISOString()).toBe(at.toISOString())
      expect(stored?.signInCount).toBe(1)
    })

    // Two devices signing in at once have no ordering, same as edits across two rooms.
    it('never moves lastSignInAt backwards', async () => {
      const user = await seedUser('returning')
      const later = new Date('2026-09-02T12:00:00Z')

      await service().recordSignIn(String(user._id), later)
      await service().recordSignIn(String(user._id), new Date('2026-09-02T09:00:00Z'))

      const stored = await reload(user._id)
      expect(stored?.lastSignInAt?.toISOString()).toBe(later.toISOString())
      expect(stored?.signInCount).toBe(2)
    })

    it('leaves the edit stamp alone', async () => {
      const user = await seedUser('reader')

      await service().recordSignIn(String(user._id), new Date())

      const stored = await reload(user._id)
      expect(stored?.lastActiveAt).toBeNull()
      expect(stored?.editCount).toBe(0)
    })

    it('does not create an account for an id that no longer exists', async () => {
      await service().recordEdit('507f1f77bcf86cd799439011', new Date())

      expect(await users().countDocuments()).toBe(0)
    })
  })

  describe('backfillLastActive', () => {
    const op = async (actor: string, at: Date) =>
      activity().create({ roomId: randomUUID(), actor, kind: 'op', at })

    it('seeds from the newest op per account', async () => {
      const user = await seedUser('returning')
      const newest = new Date('2026-08-30T10:00:00Z')
      await op(String(user._id), new Date('2026-08-01T10:00:00Z'))
      await op(String(user._id), newest)

      await service().backfillLastActive()

      expect((await reload(user._id))?.lastActiveAt?.toISOString()).toBe(newest.toISOString())
    })

    /**
     * The bug the second review caught. `room_activity` also holds `created`, `joined`,
     * `renamed` and `deleted`; counting those as edits would contradict what the metric says
     * it measures.
     */
    it('ignores activity that is not an accepted edit', async () => {
      const user = await seedUser('joiner')
      await activity().create({ roomId: randomUUID(), actor: String(user._id), kind: 'joined', at: new Date() })
      await activity().create({ roomId: randomUUID(), actor: String(user._id), kind: 'created', at: new Date() })
      await activity().create({ roomId: randomUUID(), actor: String(user._id), kind: 'renamed', at: new Date() })

      await service().backfillLastActive()

      expect((await reload(user._id))?.lastActiveAt).toBeNull()
    })

    it('skips anonymous actors', async () => {
      await op(ANONYMOUS_ACTOR, new Date())

      await expect(service().backfillLastActive()).resolves.toBe(0)
    })

    // No marker and no lock, because `$max` makes a repeat run a no-op.
    it('is safe to run twice', async () => {
      const user = await seedUser('returning')
      const at = new Date('2026-08-30T10:00:00Z')
      await op(String(user._id), at)

      await service().backfillLastActive()
      await service().backfillLastActive()

      expect((await reload(user._id))?.lastActiveAt?.toISOString()).toBe(at.toISOString())
      expect((await reload(user._id))?.editCount).toBe(0)
    })

    it('never lowers a timestamp a live edit has already set', async () => {
      const user = await seedUser('active')
      const live = new Date('2026-09-02T12:00:00Z')
      await service().recordEdit(String(user._id), live)
      await op(String(user._id), new Date('2026-08-01T10:00:00Z'))

      await service().backfillLastActive()

      expect((await reload(user._id))?.lastActiveAt?.toISOString()).toBe(live.toISOString())
    })

    it('does not backfill the edit count, which starts from release', async () => {
      const user = await seedUser('returning')
      await op(String(user._id), new Date())
      await op(String(user._id), new Date())

      await service().backfillLastActive()

      expect((await reload(user._id))?.editCount).toBe(0)
    })

    it('swallows a failure rather than stopping boot', async () => {
      await expect(service().backfillSafely()).resolves.toBeUndefined()
    })
  })
})

describe('signing in through the API stamps the account', () => {
  let context: TestContext
  const clock = new FakeClock()

  const users = () => context.app.get<Model<User>>(getModelToken(User.name))

  beforeAll(async () => {
    context = await createTestApp({ clock, unthrottled: true })
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  beforeEach(async () => {
    await resetRooms(context.app)
  })

  it('records the sign-in on a real POST /login', async () => {
    await registerAndLogin(context.app, 'signer')

    const stored = await users().findOne({ username: 'signer' }).lean()
    expect(stored?.signInCount).toBe(1)
    expect(stored?.lastSignInAt).toBeInstanceOf(Date)
    // Registering is not signing in, and neither is editing.
    expect(stored?.lastActiveAt).toBeNull()
  })

  it('counts a second sign-in without moving the account into the editors', async () => {
    const user = await registerAndLogin(context.app, 'signer')
    await call(context.app, 'post', '/login').send({ username: 'signer', password: 'ficsit-forever' })

    const stored = await users().findById(user.userId).lean()
    expect(stored?.signInCount).toBe(2)
    expect(stored?.editCount).toBe(0)
  })

  it('still issues a token when the stamp fails', async () => {
    const failing = await createTestApp({
      unthrottled: true,
      userActivity: {
        recordEdit: async () => undefined,
        recordSignIn: async () => { throw new Error('injected sign-in stamp failure') },
      },
    })
    try {
      await awaitConnection(failing.app)
      const user = await registerAndLogin(failing.app, 'resilient')
      expect(user.token).toBeTruthy()
    } finally {
      await destroyTestApp(failing)
    }
  })
})

/**
 * The invariant the whole design bends around: an edit is committed before any metric is
 * written, and no metric failure may take it back. `RoomOpService` keeps the two post-commit
 * writes in separate `try/catch` blocks so neither can skip the other either.
 */
describe('an accepted edit survives the metrics write failing', () => {
  let context: TestContext
  const clock = new FakeClock()
  const failures: string[] = []

  const rooms = () => context.app.get<Model<Room>>(getModelToken(Room.name))

  beforeAll(async () => {
    context = await createTestApp({
      clock,
      unthrottled: true,
      userActivity: {
        recordEdit: async (userId: string) => {
          failures.push(userId)
          throw new Error('injected editor-stamp failure')
        },
        recordSignIn: async () => undefined,
      },
    })
    await awaitConnection(context.app)
  })

  afterAll(async () => {
    await destroyTestApp(context)
  })

  it('still applies the op, and still bumps the room revision', async () => {
    const actor = '507f1f77bcf86cd799439011'
    const room = await rooms().create({
      roomId: randomUUID(),
      name: 'Iron Line',
      createdBy: actor,
      factories: [],
      revision: 0,
    })

    const ops = context.app.get(RoomOpService)
    const outcome = await ops.apply(
      {
        type: 'op',
        roomId: room.roomId,
        opId: randomUUID(),
        baseRevision: 0,
        diff: { powerTarget: 42 },
      } as never,
      actor,
      async () => ({ status: 'granted', role: 'owner', room: room.toObject() }) as never,
    )

    expect(outcome).toEqual({ status: 'applied', revision: 1 })
    expect(failures).toContain(actor)

    const stored = await rooms().findOne({ roomId: room.roomId }).lean()
    expect(stored?.revision).toBe(1)
  })
})
