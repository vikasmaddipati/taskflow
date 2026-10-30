import { subscribeTenantEvents } from '../services/realtimeService.js';

/**
 * Handles real-time Server-Sent Events (SSE) connections scoped to the active tenant
 */
export const streamTenantEvents = (req, res) => {
  const orgId = req.organization?._id;
  if (!orgId) {
    return res.status(400).json({ success: false, message: 'Organization context required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx proxy buffering
  res.flushHeaders();

  // Initial handshake
  res.write(`data: ${JSON.stringify({ type: 'connected', organizationId: orgId.toString() })}\n\n`);

  const unsubscribe = subscribeTenantEvents(orgId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Heartbeat ping every 30 seconds to keep connection open through load balancers
  const heartbeat = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};
