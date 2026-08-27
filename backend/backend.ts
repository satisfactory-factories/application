import http from 'http';

import Express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
// @ts-expect-error Types exist???
import { Send } from "express-serve-static-core";
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { generateSlug } from "random-word-slugs";

import {FactoryData} from "./models/FactoyDataSchema";
import {User} from "./models/UsersSchema";
import {Share, ShareDataSchema} from "./models/ShareSchema";
import {Factory} from "./interfaces/FactoryInterface";
import {
  CLIENT_OUTDATED_HEADER,
  CLIENT_TOO_OLD_CODE,
  CLIENT_VERSION_HEADER,
  isClientTooOld,
  minimumClientVersion
} from "./utils/client-version";
import { appVersion } from "./utils/app-version";

dotenv.config();

// 3001 is the API's port everywhere: here, in the Dockerfile, in both compose
// files, and on the box where the Cloudflare tunnel points at it. Keep them
// equal — 618e944 moved this to 3010 without moving anything else, and the only
// reason production survived is that it was still running an image from before
// that commit.
//
// Overridable because web's vitest fixture server also binds 3001
// (web/testing/global-setup.ts), so `PORT=3011 pnpm dev:backend` gets the two
// out of each other's way locally. Nothing deployed sets it.
const PORT = Number(process.env.PORT) || 3001;

// How long /health waits on Mongo before calling it dead. Well under the 5s
// Docker healthcheck timeout, and under any monitor's default.
const DB_PING_TIMEOUT_MS = 3000;

// *************************************************
// Setup Express
// *************************************************

// Configure rate limiter: maximum of 200 requests per 5 minutes (40 a minute)
const apiRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200,
  // /health and /version have their own limiters below; exempting them here
  // keeps each in one bucket rather than two. Otherwise a planner tab polling
  // for a release would spend the same allowance its own saves and loads need,
  // and enough tabs behind one address would 429 each other's real work.
  skip: (req) => req.path === '/health' || req.path === '/version'
});
// Prevent people / bots from spamming the crap out of the button to 1 share a minute
const shareRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5
});
// updown.io probes from three sources and Docker probes every 30s, each on its
// own IP bucket, so 10 a minute is generous.
const healthRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10
});
// The planner polls /version once a minute per visible tab, and several tabs
// can share one address. Generous enough for that, small enough to be worth
// nothing to anyone scraping it.
const versionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30
});

const app: Express.Application = Express();
// Fixes #172 413 Payload Too Large errors
app.use(Express.json({ limit: '20mb' }));
app.use(Express.urlencoded({ limit: '20mb', extended: true }));
app.set('trust proxy', 1); // Trust first proxy
app.use(apiRateLimit);

// Add CORS middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://api.satisfactory-factories.app'], // Replace with your allowed origins, e.g., 'http://localhost:3000' or specific domains
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // X-Planner-Version has to be allowed or the browser's preflight blocks every request from
  // the planner, and the outdated marker has to be exposed or scripts cannot read it.
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Planner-Version'],
  exposedHeaders: [CLIENT_OUTDATED_HEADER]
}));

// Mark every response to a client below the minimum, so a read tells an idle tab it has gone
// stale without having to refuse it anything. Only when a version was actually sent: a request
// with no header at all is not necessarily the planner.
app.use((req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
  const received = req.header(CLIENT_VERSION_HEADER);
  if (received !== undefined) {
    const minimum = minimumClientVersion();
    if (isClientTooOld(received, minimum)) {
      res.setHeader(CLIENT_OUTDATED_HEADER, minimum);
    }
  }
  next();
});

// Writes are refused outright. Issue #166: a tab left open across a release would otherwise
// autosave the old payload shape over the richer stored document, destroying plan-level state
// with no undo. Older only — a client newer than this server expects must pass, or whichever
// side deploys first locks the other out.
const requireCurrentClient = (req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
  const minimum = minimumClientVersion();
  const received = req.header(CLIENT_VERSION_HEADER) ?? null;

  if (isClientTooOld(received, minimum)) {
    console.warn(`Refused a write from client version ${received ?? 'none'} (minimum ${minimum})`);
    return res.status(426).json({
      code: CLIENT_TOO_OLD_CODE,
      message: 'This version of the planner is too old to save. Please reload the page.',
      minimumVersion: minimum,
      receivedVersion: received
    });
  }

  next();
};

// *************************************************
// MongoDB Configuration
// *************************************************

mongoose.connect(process.env.MONGODB_URI ?? 'no idea', {
  bufferCommands: true,
  autoIndex: true,
  autoCreate: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.log('Error connecting to MongoDB', error));

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
// Routes
// *************************************************

// Hello Endpoint. Liveness only — it proves the process is up and nothing else.
// Monitoring belongs on /health.
// Reports the client minimum unauthenticated, so a tab can poll for a release without needing
// an account (issue #166).
app.get('/hello', function (_req: Express.Request, res: Express.Response) {
  res.status(200).json({
    message: 'Hello, the server is running!',
    minimumClientVersion: minimumClientVersion()
  });
});

// What the site is currently running, so a planner tab can poll for a release and offer a
// reload rather than finding out when a save is refused (issue #166). Public and unauthenticated
// — most of the people who want telling do not have an account.
//
// Deliberately does not report the client minimum: /hello already does, and naming the same
// value twice invites the two drifting apart.
app.get('/version', versionRateLimit, function (_req: Express.Request, res: Express.Response) {
  // A cached copy defeats the entire point of polling.
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ version: appVersion() });
});

// Health Endpoint. 200 only if Mongo answers, 503 otherwise, so uptime
// monitoring sees a database outage instead of a cheerful process.
app.get('/health', healthRateLimit, async (_req: Express.Request, res: Express.Response) => {
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;
  let error: string | undefined;

  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('No database handle');
    // ping is Mongo's SELECT 1. Raced because bufferCommands queues the command
    // for 10s when the connection is down — longer than any monitor will wait,
    // which would make a dead database look like a slow one.
    await Promise.race([
      db.admin().command({ ping: 1 }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${DB_PING_TIMEOUT_MS}ms`)), DB_PING_TIMEOUT_MS);
      })
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`Health check failed: ${error}`);
  } finally {
    clearTimeout(timer);
  }

  res.status(error ? 503 : 200).json({
    status: error ? 'fail' : 'ok',
    uptime: Math.round(process.uptime()),
    minimumClientVersion: minimumClientVersion(),
    database: {
      status: error ? 'fail' : 'ok',
      state: mongoose.STATES[mongoose.connection.readyState],
      responseTime: Date.now() - startedAt,
      ...(error ? { error } : {})
    }
  });
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
  // Express 5's body-parser leaves req.body undefined when nothing was parsed,
  // where v4 gave an empty object. Without the guard this throws a 500 instead
  // of the 400 below.
  const token = req.body?.token;
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

// Save Data Endpoint
app.post('/save', requireCurrentClient, authenticate, async (req: AuthenticatedRequest & TypedRequestBody<{ data: any }>, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const payload = req.body;

    // Two shapes arrive here and both must keep working. Clients up to v0.5 send a bare
    // Factory[]; from v0.6 they send the whole tab, so plan-level state (the planner version,
    // the power target, groups with no members yet) survives a restore instead of being
    // silently dropped. Whatever arrives is stored as-is — `data` is Mixed — and the frontend
    // reads both. An array here is not legacy data to migrate; it is a client that has not
    // reloaded yet, and it will keep sending arrays until it does.
    const factoryData: Factory[] = Array.isArray(payload) ? payload : payload?.factories ?? [];

    // Check users are not doing naughty things with the notes and task fields
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
    })

    // The sanitising above mutates the factories in place, so storing the payload keeps those
    // corrections whichever shape it came in as.
    await FactoryData.findOneAndUpdate(
      { user: username },
      { data: payload, lastSaved: new Date() },
      { returnDocument: 'after', upsert: true }
    );

    console.log(`Data saved for ${username}`);

    res.json({ message: 'Data saved successfully', userData: payload });
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
app.post('/share', requireCurrentClient, optionalAuthenticate, shareRateLimit, async (req: AuthenticatedRequest & TypedRequestBody<{ data: any }>, res: Express.Response) => {
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

// *************************************************
// Start server
// *************************************************

// Refuse to start on a MIN_CLIENT_VERSION that isn't a version. The container's healthcheck
// gates `up --wait`, so this surfaces as a failed deploy rather than as a gate silently sitting
// at the default minimum while everything looks green.
// Resolved here rather than on first request so an unreadable package.json is visible in the
// deploy log, instead of only in a /version response nobody is watching.
console.log(`Serving version: ${appVersion()}`);

try {
  console.log(`Minimum client version: ${minimumClientVersion()}`);
} catch (error) {
  console.error(`Refusing to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

http.createServer(app).listen(PORT, () => console.log(`Webserver running at http://localhost:${PORT}/`));

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
