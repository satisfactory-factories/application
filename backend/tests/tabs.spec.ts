import { randomUUID } from 'crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';

import { app } from '../app';
import { FactoryData } from '../models/FactoyDataSchema';
import { FactoryTabData } from '../models/FactoryTabSchema';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await FactoryData.deleteMany({});
  await FactoryTabData.deleteMany({});
});

const tokenFor = (username: string) =>
  jwt.sign({ id: new mongoose.Types.ObjectId().toString(), username }, process.env.JWT_SECRET ?? 'secret', { expiresIn: '1h' });

const authHeader = (username = 'testuser') => ({ Authorization: `Bearer ${tokenFor(username)}` });

// A minimal blob standing in for a Factory — the backend treats data as Mixed and
// only inspects name / notes / tasks during sanitization.
const makeFactory = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Iron Ingots',
  notes: '',
  tasks: [],
  ...overrides,
});

const seedTab = (username: string, order = 0, overrides: Record<string, unknown> = {}) =>
  FactoryTabData.create({
    user: username,
    tabId: randomUUID(),
    name: `Tab ${order}`,
    order,
    data: [makeFactory()],
    lastSaved: new Date(),
    ...overrides,
  });

describe('auth', () => {
  it('rejects tab requests without a token', async () => {
    await request(app).get('/tabs').expect(401);
    await request(app).put(`/tabs/${randomUUID()}`).send({ name: 'x', order: 0 }).expect(401);
    await request(app).delete(`/tabs/${randomUUID()}`).expect(401);
  });
});

describe('GET /tabs — listing and lazy migration', () => {
  it('returns an empty list for a user with no data', async () => {
    const res = await request(app).get('/tabs').set(authHeader()).expect(200);
    expect(res.body).toEqual({ tabs: [], migrated: false });
  });

  it('migrates a legacy blob into a single Default tab, leaving the legacy doc in place', async () => {
    const legacyData = [makeFactory({ name: 'Legacy Factory' })];
    await FactoryData.create({ user: 'testuser', data: legacyData, lastSaved: new Date('2025-01-01') });

    const res = await request(app).get('/tabs').set(authHeader()).expect(200);
    expect(res.body.migrated).toBe(true);
    expect(res.body.tabs).toHaveLength(1);
    expect(res.body.tabs[0].name).toBe('Default');
    expect(res.body.tabs[0].order).toBe(0);
    // Metadata endpoint must not ship factory data
    expect(res.body.tabs[0].data).toBeUndefined();

    // Legacy doc untouched (rollback insurance)
    expect(await FactoryData.countDocuments({ user: 'testuser' })).toBe(1);

    // Second call must not migrate again
    const res2 = await request(app).get('/tabs').set(authHeader()).expect(200);
    expect(res2.body.migrated).toBe(false);
    expect(res2.body.tabs).toHaveLength(1);
  });

  it('returns tabs sorted by order', async () => {
    await seedTab('testuser', 2);
    await seedTab('testuser', 0);
    await seedTab('testuser', 1);

    const res = await request(app).get('/tabs').set(authHeader()).expect(200);
    expect(res.body.tabs.map((t: { order: number }) => t.order)).toEqual([0, 1, 2]);
  });

  it('does not leak other users\' tabs', async () => {
    await seedTab('someoneelse');
    const res = await request(app).get('/tabs').set(authHeader()).expect(200);
    expect(res.body.tabs).toEqual([]);
  });
});

describe('GET /tabs/full', () => {
  it('includes factory data and migrates legacy blobs too', async () => {
    const legacyData = [makeFactory({ name: 'Legacy Factory' })];
    await FactoryData.create({ user: 'testuser', data: legacyData, lastSaved: new Date() });

    const res = await request(app).get('/tabs/full').set(authHeader()).expect(200);
    expect(res.body.migrated).toBe(true);
    expect(res.body.tabs[0].data[0].name).toBe('Legacy Factory');
  });
});

describe('PUT /tabs/:tabId', () => {
  it('creates a new tab and returns lastSaved', async () => {
    const tabId = randomUUID();
    const res = await request(app)
      .put(`/tabs/${tabId}`)
      .set(authHeader())
      .send({ name: 'Main', order: 0, data: [makeFactory()] })
      .expect(200);
    expect(res.body.lastSaved).toBeDefined();

    const doc = await FactoryTabData.findOne({ user: 'testuser', tabId });
    expect(doc?.name).toBe('Main');
    expect(doc?.data).toHaveLength(1);
  });

  it('updating one tab does not touch another (per-tab isolation)', async () => {
    const tabA = await seedTab('testuser', 0);
    const tabB = await seedTab('testuser', 1);

    await request(app)
      .put(`/tabs/${tabA.tabId}`)
      .set(authHeader())
      .send({ name: 'Updated A', order: 0, data: [makeFactory({ name: 'New Factory' })] })
      .expect(200);

    const b = await FactoryTabData.findOne({ tabId: tabB.tabId });
    expect(b?.name).toBe('Tab 1');
    expect(b?.data[0].name).toBe('Iron Ingots');
  });

  it('performs a metadata-only update when data is omitted', async () => {
    const tab = await seedTab('testuser', 0);

    await request(app)
      .put(`/tabs/${tab.tabId}`)
      .set(authHeader())
      .send({ name: 'Renamed', order: 5 })
      .expect(200);

    const doc = await FactoryTabData.findOne({ tabId: tab.tabId });
    expect(doc?.name).toBe('Renamed');
    expect(doc?.order).toBe(5);
    expect(doc?.data[0].name).toBe('Iron Ingots'); // data untouched
  });

  it('rejects non-UUID tab ids', async () => {
    await request(app)
      .put('/tabs/not-a-uuid')
      .set(authHeader())
      .send({ name: 'x', order: 0, data: [] })
      .expect(400);
  });

  it('rejects invalid order and data types', async () => {
    const tabId = randomUUID();
    await request(app).put(`/tabs/${tabId}`).set(authHeader()).send({ name: 'x', order: 'first', data: [] }).expect(400);
    await request(app).put(`/tabs/${tabId}`).set(authHeader()).send({ name: 'x', order: 0, data: { not: 'an array' } }).expect(400);
  });

  it('sanitizes oversized factory fields and tab names', async () => {
    const tabId = randomUUID();
    await request(app)
      .put(`/tabs/${tabId}`)
      .set(authHeader())
      .send({
        name: 'T'.repeat(150),
        order: 0,
        data: [makeFactory({
          name: 'N'.repeat(300),
          notes: 'x'.repeat(2000),
          tasks: Array.from({ length: 60 }, () => ({ title: 't'.repeat(300), completed: false })),
        })],
      })
      .expect(200);

    const doc = await FactoryTabData.findOne({ user: 'testuser', tabId });
    expect(doc?.name).toHaveLength(100);
    expect(doc?.data[0].name).toHaveLength(200);
    expect(doc?.data[0].notes).toHaveLength(1000);
    expect(doc?.data[0].tasks).toHaveLength(50);
    expect(doc?.data[0].tasks[0].title).toHaveLength(200);
  });

  it('enforces the 50-tab cap for new tabs but still allows updates', async () => {
    await FactoryTabData.insertMany(Array.from({ length: 50 }, (_, i) => ({
      user: 'testuser',
      tabId: randomUUID(),
      name: `Tab ${i}`,
      order: i,
      data: [],
    })));

    await request(app)
      .put(`/tabs/${randomUUID()}`)
      .set(authHeader())
      .send({ name: 'One too many', order: 50, data: [] })
      .expect(400);

    // Updating an existing tab is still fine at the cap
    const existing = await FactoryTabData.findOne({ user: 'testuser', order: 0 });
    await request(app)
      .put(`/tabs/${existing?.tabId}`)
      .set(authHeader())
      .send({ name: 'Still updatable', order: 0 })
      .expect(200);
  });
});

describe('DELETE /tabs/:tabId', () => {
  it('deletes only the targeted tab of the authenticated user', async () => {
    const mine = await seedTab('testuser', 0);
    const keep = await seedTab('testuser', 1);
    const theirs = await seedTab('someoneelse', 0);

    await request(app).delete(`/tabs/${mine.tabId}`).set(authHeader()).expect(200);

    expect(await FactoryTabData.countDocuments({ tabId: mine.tabId })).toBe(0);
    expect(await FactoryTabData.countDocuments({ tabId: keep.tabId })).toBe(1);
    expect(await FactoryTabData.countDocuments({ tabId: theirs.tabId })).toBe(1);
  });

  it('cannot delete another user\'s tab by id', async () => {
    const theirs = await seedTab('someoneelse', 0);
    await request(app).delete(`/tabs/${theirs.tabId}`).set(authHeader()).expect(200);
    expect(await FactoryTabData.countDocuments({ tabId: theirs.tabId })).toBe(1);
  });
});

describe('PUT /tabs/order', () => {
  it('batch-updates tab order', async () => {
    const a = await seedTab('testuser', 0);
    const b = await seedTab('testuser', 1);

    await request(app)
      .put('/tabs/order')
      .set(authHeader())
      .send([
        { tabId: a.tabId, order: 1 },
        { tabId: b.tabId, order: 0 },
      ])
      .expect(200);

    const res = await request(app).get('/tabs').set(authHeader()).expect(200);
    expect(res.body.tabs.map((t: { tabId: string }) => t.tabId)).toEqual([b.tabId, a.tabId]);
  });

  it('rejects malformed payloads', async () => {
    await request(app).put('/tabs/order').set(authHeader()).send({ tabId: 'x' }).expect(400);
    await request(app).put('/tabs/order').set(authHeader()).send([{ tabId: 'not-a-uuid', order: 0 }]).expect(400);
    await request(app).put('/tabs/order').set(authHeader()).send([{ tabId: randomUUID(), order: 'first' }]).expect(400);
  });
});

describe('legacy /save deprecation', () => {
  it('still accepts legacy saves', async () => {
    await request(app)
      .post('/save')
      .set(authHeader())
      .send([makeFactory()])
      .expect(200);

    const doc = await FactoryData.findOne({ user: 'testuser' });
    expect(doc?.data).toHaveLength(1);
  });
});
