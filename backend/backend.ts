import http from 'http';

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

import { app } from './app';

dotenv.config();

const PORT = 3010;

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
// Start server
// *************************************************

http.createServer(app).listen(PORT, () => console.log(`Webserver running at http://localhost:${PORT}/`));
