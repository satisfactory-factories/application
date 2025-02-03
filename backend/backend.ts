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

dotenv.config();

const PORT = 3001;

// *************************************************
// Setup Express
// *************************************************

// Configure rate limiter: maximum of 200 requests per 5 minutes (40 a minute)
const apiRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200
});
// Prevent people / bots from spamming the crap out of the button to 1 share a minute
const shareRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5
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
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// Save Data Endpoint
app.post('/save', authenticate, async (req: AuthenticatedRequest & TypedRequestBody<{ data: any }>, res: Express.Response) => {
  try {
    const { username } = req.user as jwt.JwtPayload & { username: string };
    const factoryData: Factory[] = req.body;

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

// *************************************************
// Start server
// *************************************************

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
