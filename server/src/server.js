import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

// Validate environment variables on startup
validateEnv();

// Connect to MongoDB
connectDB();

const app = express();

// Security Headers via Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false // Vite frontend serves its own assets
  })
);

// Explicit CORS Configuration with origin allowlist
const allowedOrigins = config.cors.allowedOrigins;
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || (!config.isProd && origin.startsWith('http://localhost:'))) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy does not allow access from origin ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-timezone', 'x-organization-id', 'x-workspace-id', 'x-razorpay-signature']
  })
);

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
      console.error('[MongoDB Error during shutdown]', err);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if hanging
  setTimeout(() => {
    console.error('[Server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error(`[Unhandled Rejection] ${err?.message || err}`);
});

export default app;
