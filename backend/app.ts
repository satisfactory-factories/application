import { randomUUID } from 'crypto';

import Express from 'express';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
// @ts-expect-error Types exist???
import { Send } from "express-serve-static-core";
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { generateSlug } from "random-word-slugs";

import {FactoryData} from "./models/FactoyDataSchema";
import {FactoryTabData} from "./models/FactoryTabSchema";
import {User} from "./models/UsersSchema";
import {Share, ShareDataSchema} from "./models/ShareSchema";
import {Factory} from "./interfaces/FactoryInterface";

dotenv.config();

// *************************************************
// Setup Express
// *************************************************

// Configure rate limiter: maximum of 200 requests per 5 minutes (40 a minute)
const apiRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200,
  skip: () => process.env.NODE_ENV === 'test',
});
// Prevent people / bots from spamming the crap out of the button to 1 share a minute
const shareRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  skip: () => process.env.NODE_ENV === 'test',
});

export const app: Express.Application = Express();
// Fixes #172 413 Payload Too Large errors
app.use(Express.json({ limit: '20mb' }));
app.use(Express.urlencoded({ limit: '20mb', extended: true }));
app.set('trust proxy', 1); // Trust first proxy
app.use(apiRateLimit);

// Add CORS middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://api.satisfactory-factories.app'], // Replace with your allowed origins, e.g., 'http://localhost:3000' or specific domains
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// *************************************************
// Request/Response Types
// *************************************************

export interface TypedRequestBody<T> extends Express.Request {
  body: T;
}

export interface TypedResponse<ResBody> extends Express.Response {
  json: Send<ResBody, this>;
}

// *************************************************
// Middleware to authenticate with JWT
// *************************************************

interface AuthenticatedRequest extends Express.Request {
  user?: string | jwt.JwtPayload;
}

const authenticate = (req: AuthenticatedRequest, res: Express.Response, next: Express.NextFunction) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET ?? 'secret');
    next();
    // eslint-disable-next-line
  } catch (error: any) {
    if (error.message) {
      console.log(error.message);
    }
    return res.status(401).json({ message: 'Unauthorized' });
  }
};
const optionalAuthenticate = (req: AuthenticatedRequest, res: Express.Response, next: Express.NextFunction) => {
  const token = req.header('Authorization')?.replace('Bearer ', '') ?? '';
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET ?? 'secret') ?? 'unknown';
    next();
    // eslint-disable-next-line
  } catch (error: any) {
    req.user = 'Anonymous';
    next();
    // Do nothing
  }
};

// *************************************************
// Tab helpers
// *************************************************

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TABS_PER_USER = 50;
const MAX_TAB_NAME_LENGTH = 100;

// Check users are not doing naughty things with the names, notes and task fields
export const sanitizeFactories = (factoryData: Factory[], username: string): Factory[] => {
  factoryData.forEach((factory) => {
    if (factory.name.length > 200) {
      console.warn(`User ${username} tried to save a factory name that was too long!`);
      factory.name = factory.name.substring(0, 200);
    }

    if (factory.notes && factory.notes.length > 1000) {
      console.warn(`User ${username} tried to save a notes field that was too long!`);
      factory.notes = factory.notes.substring(0, 1000);
    }

    if (factory.tasks) {
      // Make sure it doesn't exceed a certain character limit
      factory.tasks.forEach((task) => {
        if (task.title.length > 200) {
          console.warn(`User ${username} tried to save a factory task that was way too long!`);
          task.title = task.title.substring(0, 200);
        }
      });

      // Make sure they can't take the piss with a stupid number of tasks
      if (factory.tasks.length > 50) {
        console.warn(`User ${username} tried to save a factory with too many tasks!`);
        factory.tasks = factory.tasks.slice(0, 50);
      }
    }
  });

  return factoryData;
};

const sanitizeTabName = (name: string, username: string): string => {
  if (name.length > MAX_TAB_NAME_LENGTH) {
    console.warn(`User ${username} tried to save a tab name that was too long!`);
    return name.substring(0, MAX_TAB_NAME_LENGTH);
  }
  return name;
};

interface TabResponseEntry {
  tabId: string;
  name: string;
  order: number;
  lastSaved: Date;
  data?: Factory[];
}

// Fetches the user's tabs, lazily migrating their legacy single-blob FactoryData
// document into a single "Default" tab on first contact. The legacy document is
// deliberately left in place as rollback insurance.
const getTabsWithMigration = async (username: string, includeData: boolean): Promise<{ tabs: TabResponseEntry[], migrated: boolean }> => {
  const buildQuery = () => {
    const query = FactoryTabData.find({ user: username }).sort({ order: 1 });
    return includeData ? query : query.select('-data');
  };

  let tabs = await buildQuery();
  let migrated = false;

  if (tabs.length === 0) {
    const legacy = await FactoryData.findOne({ user: username });
    if (legacy) {
      await FactoryTabData.create({
        user: username,
        tabId: randomUUID(),
        name: 'Default',
        order: 0,
        data: legacy.data,
        lastSaved: legacy.lastSaved ?? new Date(),
      });
      console.log(`Migrated legacy plan data to a tab document for ${username}`);
      migrated = true;
      tabs = await buildQuery();
    }
  }

  return {
    migrated,
    tabs: tabs.map((tab): TabResponseEntry => ({
      tabId: tab.tabId,
      name: tab.name,
      order: tab.order,
      lastSaved: tab.lastSaved,
      ...(includeData ? { data: tab.data } : {}),
    })),
  };
};

// *************************************************
// Routes
// *************************************************

// Hello Endpoint
app.get('/hello', function (_req: Express.Request, res: Express.Response) {
  res.status(200).json({ message: 'Hello, the server is running!' });
});

// Register Endpoint
app.post('/register', async (req: TypedRequestBody<{ username: string; password: string }>, res: Express.Response) => {
  try {
    const { username, password } = req.body;

    // Ensure the username isn't stupidly long
    if (username.length > 100) {
      return res.status(400).json({ message: 'Username too long.' });
    }

    // Ensure the password isn't stupidly long
    if (password.length > 100) {
      return res.status(400).json({ message: 'Password too long.' });
    }

    // Check if username is an email address
    if (isEmailAddress(username)) {
      return res.status(400).json({ message: 'Please do not register with an email address. We do not wish to store PII.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if the user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    const user = new User({ username, password: hashedPassword });
    await user.save();
    console.log(`Successfully registered new user ${username}!`);
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (error) {
    res.status(400).json({ message: 'Registration failed.', error });
  }
});

// Login Endpoint
app.post('/login', async (req: TypedRequestBody<{ username: string; password: string }>, res: TypedResponse<{ token: string }>) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const secret = process.env.JWT_SECRET ?? 'secret';
    const token = jwt.sign({ id: user._id, username: user.username }, secret, { expiresIn: '30d' });

    console.log(`Successfully signed in user ${username}`);
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error });
  }
});

// Validate Token Endpoint
app.post('/validate-token', (req: TypedRequestBody<{ token: string }>, res: Express.Response) => {
  const token = req.body.token;
  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? 'secret');
    res.status(200).json({ valid: true, decoded });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    res.status(401).json({ valid: false, message: 'Invalid or expired token' });
  }
});

// *************************************************
// Tab Endpoints (v2 sync)
// *************************************************

// List the user's tabs (metadata only). Triggers lazy migration of legacy data.
app.get('/tabs', authenticate, async (req: AuthenticatedRequest, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const result = await getTabsWithMigration(username, false);
    res.json(result);
  } catch (error) {
    console.error(`Tab list failed: ${error}`);
    res.status(500).json({ message: 'Tab list failed', error });
  }
});

// Full load: all tabs including factory data.
app.get('/tabs/full', authenticate, async (req: AuthenticatedRequest, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const result = await getTabsWithMigration(username, true);
    res.json(result);
  } catch (error) {
    console.error(`Tab full load failed: ${error}`);
    res.status(500).json({ message: 'Tab full load failed', error });
  }
});

// Batch reorder. Registered before /tabs/:tabId so "order" isn't matched as a tabId.
app.put('/tabs/order', authenticate, async (req: AuthenticatedRequest & TypedRequestBody<{ tabId: string, order: number }[]>, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const entries = req.body;

    if (!Array.isArray(entries) || entries.some(entry => !UUID_REGEX.test(entry?.tabId ?? '') || !Number.isFinite(entry?.order))) {
      return res.status(400).json({ message: 'Invalid order payload.' });
    }

    await FactoryTabData.bulkWrite(entries.map(entry => ({
      updateOne: {
        filter: { user: username, tabId: entry.tabId },
        update: { $set: { order: entry.order } },
      },
    })));

    res.json({ message: 'Tab order saved' });
  } catch (error) {
    console.error(`Tab order save failed: ${error}`);
    res.status(500).json({ message: 'Tab order save failed', error });
  }
});

// Load a single tab with data.
app.get('/tabs/:tabId', authenticate, async (req: AuthenticatedRequest, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const { tabId } = req.params;

    const tab = await FactoryTabData.findOne({ user: username, tabId });
    if (!tab) {
      return res.status(404).json({ message: 'Tab not found' });
    }

    res.json({ tabId: tab.tabId, name: tab.name, order: tab.order, lastSaved: tab.lastSaved, data: tab.data });
  } catch (error) {
    console.error(`Tab load failed: ${error}`);
    res.status(500).json({ message: 'Tab load failed', error });
  }
});

// Upsert a single tab. Omitting `data` performs a metadata-only update (rename / reorder).
app.put('/tabs/:tabId', authenticate, async (req: AuthenticatedRequest & TypedRequestBody<{ name?: string, order?: number, data?: Factory[] }>, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const { tabId } = req.params;
    const { name, order, data } = req.body;

    if (!UUID_REGEX.test(tabId)) {
      return res.status(400).json({ message: 'Invalid tab ID.' });
    }
    if (name !== undefined && typeof name !== 'string') {
      return res.status(400).json({ message: 'Invalid tab name.' });
    }
    if (order !== undefined && !Number.isFinite(order)) {
      return res.status(400).json({ message: 'Invalid tab order.' });
    }
    if (data !== undefined && !Array.isArray(data)) {
      return res.status(400).json({ message: 'Invalid tab data.' });
    }

    const existing = await FactoryTabData.findOne({ user: username, tabId }).select('_id');
    if (!existing) {
      // New tab: metadata is required, and the user cannot exceed the tab cap
      if (name === undefined || order === undefined) {
        return res.status(400).json({ message: 'New tabs require a name and order.' });
      }
      const tabCount = await FactoryTabData.countDocuments({ user: username });
      if (tabCount >= MAX_TABS_PER_USER) {
        console.warn(`User ${username} hit the tab limit!`);
        return res.status(400).json({ message: `Tab limit of ${MAX_TABS_PER_USER} reached.` });
      }
    }

    const lastSaved = new Date();
    const update: Record<string, unknown> = { lastSaved };
    if (name !== undefined) update.name = sanitizeTabName(name, username);
    if (order !== undefined) update.order = order;
    if (data !== undefined) update.data = sanitizeFactories(data, username);

    // A metadata-only upsert of a brand new tab still needs a data field to satisfy the schema
    const setOnInsert: Record<string, unknown> = data === undefined ? { data: [] } : {};

    await FactoryTabData.findOneAndUpdate(
      { user: username, tabId },
      { $set: update, $setOnInsert: setOnInsert },
      { new: true, upsert: true }
    );

    console.log(`Tab ${tabId} saved for ${username}`);
    res.json({ message: 'Tab saved successfully', lastSaved });
  } catch (error) {
    console.error(`Tab save failed: ${error}`);
    res.status(500).json({ message: 'Tab save failed', error });
  }
});

// Delete a single tab. The client enforces keeping at least one tab.
app.delete('/tabs/:tabId', authenticate, async (req: AuthenticatedRequest, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const { tabId } = req.params;

    await FactoryTabData.deleteOne({ user: username, tabId });

    console.log(`Tab ${tabId} deleted for ${username}`);
    res.json({ message: 'Tab deleted successfully' });
  } catch (error) {
    console.error(`Tab delete failed: ${error}`);
    res.status(500).json({ message: 'Tab delete failed', error });
  }
});

// *************************************************
// Legacy single-blob Endpoints (deprecated — remove once logs show no stale-client hits)
// *************************************************

// Save Data Endpoint
app.post('/save', authenticate, async (req: AuthenticatedRequest & TypedRequestBody<{ data: any }>, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const factoryData: Factory[] = sanitizeFactories(req.body, username);

    // Stale clients only: users on the v2 tab sync never call this
    const hasTabDocs = await FactoryTabData.exists({ user: username });
    if (hasTabDocs) {
      console.warn(`DEPRECATED /save hit by ${username}, who already has v2 tab documents! Their legacy save was accepted but will be ignored by v2 clients.`);
    }

    await FactoryData.findOneAndUpdate(
      { user: username },
      { data: factoryData, lastSaved: new Date() },
      { new: true, upsert: true }
    );

    console.log(`Data saved for ${username}`);

    res.json({ message: 'Data saved successfully', userData: factoryData });
  } catch (error) {
    console.error(`Data save failed: ${error}`);
    res.status(500).json({ message: 'Data save failed', error });
  }
});

// Load Data Endpoint
app.get('/load', authenticate, async (req: AuthenticatedRequest & TypedRequestBody<{ data: any }>, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };

    const data = await FactoryData.findOne(
      { user: username },
    );

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Data save failed', error });
  }
});

// Share link create endpoint
app.post('/share', optionalAuthenticate, shareRateLimit, async (req: AuthenticatedRequest & TypedRequestBody<{ data: any }>, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const factoryData = req.body;

    console.log(`Creating share link for user ${username}`);

    const shareId = await generateShareWords(3);

    const shareData: ShareDataSchema = {
      id: shareId,
      data: JSON.stringify(factoryData),
      createdBy: username ?? 'Anonymous',
      created: new Date(),
      views: 0,
      lastViewed: new Date(),
    };

    const share = new Share(shareData);
    await share.save();
    console.log('Share link created!');

    res.json({
      shareId,
      status: 'success',
      share
    });
  } catch (error) {
    console.error(`Share link creation failed: ${error}`);
    res.status(500).json({ status: 'fail', error });
  }
});
// Retrieve shared data
app.get('/share/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Fetching shared data for ID: ${id}`);

    const share = await Share.findOne({ id });

    if (!share) {
      return res.status(404).json({ message: 'Share link not found' });
    }

    // Increment views and update last viewed timestamp
    share.views += 1;
    share.lastViewed = new Date();
    await share.save();

    console.log('Share data retrieved successfully');
    res.json({ data: JSON.parse(share.data) });
  } catch (error) {
    console.error(`Failed to fetch shared data: ${error}`);
    res.status(500).json({ message: 'Failed to fetch shared data', error });
  }
});

// *************************************************
// Add 404 handler
// *************************************************

app.use(function (_req: Express.Request, res: Express.Response) {
  res.status(404).send('Not found');
});

const generateShareWords = async (count: number): Promise<string> => {
    // Check we haven't generated this share ID before
    const shareId = generateSlug(count);
    const existingShare = await Share.findOne({ id: shareId });

    // This is EXTREMELY unlikely to happen but in the event that it does...
    if (existingShare) {
      const maxAttempts = 10;
      if (count >= maxAttempts) throw new Error('Max attempts reached');
      return await generateShareWords(count + 1); // Try again with incremented count
    }

    return shareId;
};

const isEmailAddress = (input: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(input);
}
