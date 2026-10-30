import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import connectDB from './config/db.js';
import { validateEnv, config } from './config/env.js';
import sanitizeInputs from './middleware/sanitize.js';
import v1Router from './routes/v1/index.js';
import { getHealth, getLiveness, getReadiness, setShuttingDown } from './controllers/healthController.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { startReminderDaemon } from './services/reminderScheduler.js';

// Validate environment variables on startup (strict fail-fast)
validateEnv();

// Connect to MongoDB (non-blocking for Passenger startup)
connectDB().catch((dbErr) => {
  console.error('[MongoDB Startup] Initial connect error:', dbErr?.message);
});

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
          'https://accounts.google.com',
          'https://checkout.razorpay.com'
        ],
        frameSrc: [
          "'self'",
          'https://accounts.google.com/gsi/',
          'https://accounts.google.com',
          'https://api.razorpay.com'
        ],
        connectSrc: [
          "'self'",
          'https://accounts.google.com/gsi/',
          'https://accounts.google.com',
          'https://api.razorpay.com',
          'https://lumberjack.razorpay.com',
          ...config.cors.allowedOrigins
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://*.googleusercontent.com',
          'https://*.razorpay.com',
          'https://accounts.google.com'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://accounts.google.com'
        ],
        styleSrcElem: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://accounts.google.com'
        ],
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
      origin.startsWith('capacitor://') ||
      origin.startsWith('ionic://') ||
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
    'X-XSRF-TOKEN',
    'X-API-Version'
  ],
  exposedHeaders: ['X-XSRF-TOKEN', 'x-csrf-token', 'X-API-Version'],
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

// NoSQL Injection Sanitization: Strips $ and . operators from body, query, and params
app.use(sanitizeInputs);

// Standard API Versioning Header
app.use((req, res, next) => {
  res.setHeader('X-API-Version', '1.0.0');
  next();
});

// Deep Health Check & Kubernetes Probes (Root level shortcuts)
app.get('/health', getHealth);
app.get('/api/health', getHealth);
app.get('/api/outbound-ip', async (req, res) => {
  try {
    const fetchRes = await fetch('https://api.ipify.org?format=json');
    const data = await fetchRes.json();
    res.json({ outboundIp: data.ip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/reset-test-user', async (req, res) => {
  try {
    const User = mongoose.model('User');
    const Organization = mongoose.model('Organization');
    const deletedUser = await User.deleteMany({ email: 'vikasmaddipati3@gmail.com' });
    const deletedOrg = await Organization.deleteMany({ name: "Vikas Maddipati's Workspace" });
    res.json({ success: true, deletedUser, deletedOrg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/app-restart', (req, res) => {
  res.json({ restarting: true, timestamp: Date.now() });
  setTimeout(() => {
    console.log('[Server] Restart requested via /api/app-restart');
    process.exit(0);
  }, 200);
});

// Database connection guard for API routes
app.use('/api', (req, res, next) => {
  // Allow health endpoints and session probe to pass through
  if (
    req.path === '/health' ||
    req.path === '/v1/health' ||
    req.path === '/auth/session' ||
    req.path === '/session' ||
    req.path === '/outbound-ip' ||
    req.path === '/admin/reset-test-user' ||
    req.path === '/app-restart'
  ) {
    return next();
  }

  // Reject immediately only when completely disconnected
  if (mongoose.connection.readyState === 0) {
    return res.status(503).json({
      success: false,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database connection is not configured or offline. Please configure a valid MONGODB_URI (e.g. MongoDB Atlas) in your server .env file.'
    });
  }
  next();
});
app.get('/api/health/live', getLiveness);
app.get('/api/health/ready', getReadiness);

// Mount Versioned Routes (Canonical: /api/v1, Backward-Compatible Legacy: /api)
app.use('/api/v1', v1Router);
app.use('/api', v1Router);

// Serve static client bundle if present (Production / cPanel Deployment)
const clientDistPath = path.resolve(process.cwd(), 'client/dist');
const altPublicPath = path.resolve(process.cwd(), 'public');
const distPath = fs.existsSync(clientDistPath)
  ? clientDistPath
  : fs.existsSync(altPublicPath)
  ? altPublicPath
  : null;

if (distPath) {
  app.use(express.static(distPath));
  // Single-Page Application (SPA) client routing fallback
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error Handling Middleware
app.use(notFound);
app.use(errorHandler);

const PORT = config.port;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`[Server] Running in ${config.env} mode on ${HOST}:${PORT}`);
  console.log(`[Server] Health check: http://127.0.0.1:${PORT}/api/health`);
  console.log(`[Server] API v1: http://127.0.0.1:${PORT}/api/v1`);
  console.log(`[Server] CORS Allowed Origins:`, allowedOrigins);

  // Background reminder scheduler daemon
  if (config.env !== 'test') {
    startReminderDaemon();
  }
});

// Graceful Shutdown & Process Signal Trapping
let isTerminating = false;

export const handleGracefulShutdown = (signal, exitCode = 0) => {
  if (isTerminating) {
    console.log(`[Server] Shutdown already underway. Ignoring subsequent signal: ${signal}`);
    return;
  }
  isTerminating = true;
  setShuttingDown(true);

  console.log(`\n[Server] ${signal} signal received: initiating graceful shutdown (pid: ${process.pid})`);

  // Stop accepting new connections from ingress / load balancers
  server.close(async () => {
    console.log('[Server] In-flight HTTP requests drained. HTTP server stopped.');
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close(false);
        console.log('[MongoDB] Connection pool flushed and closed cleanly.');
      }
      process.exit(exitCode);
    } catch (err) {
      console.error('[MongoDB] Error during database disconnect:', err.message);
      process.exit(1);
    }
  });

  // Close idle keep-alive connections immediately so they don't block server.close()
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }

  // Safety watchdog timer: force termination if connections fail to drain within timeout
  const FORCE_SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10);
  const watchdog = setTimeout(() => {
    console.error(`[Server] Graceful shutdown watchdog triggered after ${FORCE_SHUTDOWN_TIMEOUT_MS}ms. Forcing exit.`);
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    process.exit(1);
  }, FORCE_SHUTDOWN_TIMEOUT_MS);

  if (watchdog.unref) {
    watchdog.unref();
  }
};

// Container orchestrator shutdown signals (Docker / Kubernetes) and terminal interrupts
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT', 0));
process.on('SIGHUP', () => handleGracefulShutdown('SIGHUP', 0));

// Process traps for unexpected runtime faults
process.on('uncaughtException', (err) => {
  console.error('[Server] FATAL: Uncaught Exception:', err);
  handleGracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[Server] Warning: Unhandled Promise Rejection:', reason);
});

export default app;
