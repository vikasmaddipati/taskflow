import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import { validateEnv, config } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import orgRoutes from './routes/orgRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import { handleRazorpayWebhook } from './controllers/webhookController.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

// Validate environment variables on startup (strict fail-fast)
validateEnv();

// Connect to MongoDB
connectDB();

const app = express();

// Trust reverse proxy if running behind TLS termination proxy in production
if (config.isProd) {
  app.set('trust proxy', 1);
}

// Enhanced Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://accounts.google.com/gsi/client',
          'https://checkout.razorpay.com'
        ],
        frameSrc: [
          "'self'",
          'https://accounts.google.com/gsi/',
          'https://api.razorpay.com'
        ],
        connectSrc: [
          "'self'",
          'https://accounts.google.com/gsi/',
          'https://api.razorpay.com',
          'https://lumberjack.razorpay.com',
          ...config.cors.allowedOrigins
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://*.googleusercontent.com',
          'https://*.razorpay.com'
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'sameorigin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isProd
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      : false
  })
);

// Cookie Parser Middleware for HttpOnly Cookie Session Management
app.use(cookieParser());

// Explicit CORS Configuration with origin allowlist
const allowedOrigins = config.cors.allowedOrigins;
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      (!config.isProd && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')))
    ) {
      callback(null, true);
    } else {
      // Rejects unapproved origins gracefully according to CORS spec without crashing
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-timezone',
    'x-organization-id',
    'x-workspace-id',
    'x-razorpay-signature',
    'x-razorpay-event-id',
    'x-test-mode',
    'x-csrf-token',
    'x-xsrf-token',
    'X-XSRF-TOKEN'
  ],
  exposedHeaders: ['X-XSRF-TOKEN', 'x-csrf-token'],
  maxAge: 86400 // 24 hours preflight caching
};

app.use(cors(corsOptions));

// Express Parsers with rawBody retention for webhook signature verification
app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Health check route with active database connection verification
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const isDbConnected = dbState === 1;

  const status = isDbConnected ? 'ok' : 'degraded';
  const statusCode = isDbConnected ? 200 : 503;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    environment: config.env,
    database: {
      connected: isDbConnected,
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown'
    }
  });
});

// Mount Routes
app.post('/api/webhooks/razorpay', handleRazorpayWebhook);
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/billing', billingRoutes);

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log(`[Server] Running in ${config.env} mode on port ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
  console.log(`[Server] CORS Allowed Origins:`, allowedOrigins);
});

// Graceful Shutdown handling
const handleGracefulShutdown = (signal) => {
  console.log(`\n[Server] ${signal} signal received: closing HTTP server and database connection`);
  server.close(async () => {
    console.log('[Server] HTTP server closed');
    try {
      await mongoose.connection.close(false);
      console.log('[MongoDB] Connection closed smoothly');
      process.exit(0);
    } catch (err) {
      console.error('[MongoDB] Error during connection close:', err.message);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

export default app;
