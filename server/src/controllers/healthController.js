import mongoose from 'mongoose';
import { config } from '../config/env.js';

const STATE_NAMES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

export let isShuttingDown = false;

export const setShuttingDown = (val) => {
  isShuttingDown = Boolean(val);
};

/**
 * Deep production health check endpoint with database ping & resource metrics
 * @route GET /api/health, GET /api/v1/health
 */
export const getHealth = async (req, res) => {
  res.setHeader('X-API-Version', '1.0.0');

  if (isShuttingDown) {
    return res.status(503).json({
      status: 'terminating',
      healthy: false,
      message: 'Server is undergoing graceful shutdown',
      timestamp: new Date().toISOString()
    });
  }
  const startTime = Date.now();
  const dbState = mongoose.connection.readyState;
  const isConnected = dbState === 1;

  let dbPingMs = null;
  let dbError = null;

  if (isConnected && mongoose.connection.db) {
    try {
      const pingStart = Date.now();
      await mongoose.connection.db.admin().ping();
      dbPingMs = Date.now() - pingStart;
    } catch (err) {
      dbError = err.message;
    }
  }

  const isHealthy = isConnected && !dbError;
  const status = isHealthy ? 'ok' : 'degraded';
  const statusCode = isHealthy ? 200 : 503;

  const mem = process.memoryUsage();
  const memInMb = {
    rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
    heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
    heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100
  };

  res.setHeader('X-API-Version', '1.0.0');

  res.status(statusCode).json({
    status,
    healthy: isHealthy,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.env,
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      connected: isConnected,
      state: STATE_NAMES[dbState] || 'unknown',
      latencyMs: dbPingMs,
      ...(dbError && { error: dbError })
    },
    memory: memInMb,
    responseTimeMs: Date.now() - startTime
  });
};

/**
 * Lightweight Kubernetes Liveness Probe
 * @route GET /api/health/live, GET /api/v1/health/live
 */
export const getLiveness = (req, res) => {
  res.setHeader('X-API-Version', '1.0.0');

  if (isShuttingDown) {
    return res.status(503).json({
      status: 'terminating',
      reason: 'Server is undergoing graceful shutdown',
      timestamp: new Date().toISOString()
    });
  }

  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
};

/**
 * Kubernetes Readiness Probe (verifies database readiness before traffic routing)
 * @route GET /api/health/ready, GET /api/v1/health/ready
 */
export const getReadiness = async (req, res) => {
  res.setHeader('X-API-Version', '1.0.0');

  if (isShuttingDown) {
    return res.status(503).json({
      status: 'not_ready',
      reason: 'Server is undergoing graceful shutdown',
      timestamp: new Date().toISOString()
    });
  }

  const isConnected = mongoose.connection.readyState === 1;

  if (!isConnected) {
    return res.status(503).json({
      status: 'not_ready',
      reason: 'Database not connected',
      timestamp: new Date().toISOString()
    });
  }

  try {
    await mongoose.connection.db.admin().ping();
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'not_ready',
      reason: err.message,
      timestamp: new Date().toISOString()
    });
  }
};
