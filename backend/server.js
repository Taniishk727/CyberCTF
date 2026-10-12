import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { authRoutes, challengeRoutes, leaderboardRoutes, adminRoutes, userRoutes, categoryRoutes, emailRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { connectDB } from './utils/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

const app = express();
const PORT = process.env.PORT || 5000;

if (!process.env.MONGO_URI && !process.env.MONGODB_URI) {
  console.warn('[CONFIG] MONGO_URI is not set (MONGODB_URI fallback also missing)');
}

if (!process.env.JWT_SECRET) {
  console.warn('[CONFIG] JWT_SECRET is not set');
}

// 1. Security Headers
app.use(helmet());

// 2. Compression
app.use(compression());

// 3. CORS Configuration
const rawOrigins = [
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
  'https://cyber-ctf-seven.vercel.app',
  'https://cyber-ctf-beta.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173'
].filter(Boolean);

// Normalize allowed origins by trimming whitespace and removing trailing slashes
const allowedOrigins = [...new Set(rawOrigins.map(o => o.trim().replace(/\/+$/, '')))];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow server-to-server or non-browser tools (e.g. curl, health checks) with no Origin header
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.trim().replace(/\/+$/, '');

    // Allow explicitly configured origins
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    // Allow official Vercel preview deployments for this project (e.g. https://cyber-ctf-*-yourteam.vercel.app)
    if (/^https:\/\/cyber-ctf(-[a-z0-9_-]+)?\.vercel\.app$/.test(normalizedOrigin)) {
      return callback(null, true);
    }

    // Allow any origin in non-production environments (e.g. testing)
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    return callback(new Error('CORS policy violation: Origin not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 4. Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. NoSQL Injection Prevention & HTTP Parameter Pollution Protection
app.use(mongoSanitize());
app.use(hpp());

// 6. DB Connection Middleware (Guarantees active connection in serverless & container environments)
app.use(async (req, res, next) => {
  // Allow healthcheck and preflight OPTIONS without blocking if DB is disconnected
  if (req.path === '/api/health' || req.method === 'OPTIONS') {
    return next();
  }
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    next();
  } catch (err) {
    console.error('[DB] Failed to ensure connection:', err.message);
    next(err);
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/categories', categoryRoutes);

app.use('/api/email', emailRoutes);
app.get('/api/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    db: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Error handler
app.use(errorHandler);

// Global connection event handlers
mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('[DB] MongoDB error:', err.message);
});

// Server listener: only start when not running as a Vercel serverless function
if (!process.env.VERCEL) {
  connectDB().catch((err) => {
    console.error('Initial MongoDB connection error:', err.message);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on ${PORT}`);
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught Exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[PROCESS] Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
