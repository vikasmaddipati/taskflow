import { EventEmitter } from 'events';

const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(2000);

/**
 * Broadcasts a real-time event to all connected clients in a tenant
 *
 * @param {string} organizationId - Target organization ID
 * @param {string} eventType - Type of event (e.g. 'task:created', 'task:updated', 'board:change')
 * @param {object} payload - Event payload
 */
export const broadcastTenantEvent = (organizationId, eventType, payload = {}) => {
  if (!organizationId) return;
  const channel = `tenant:${organizationId.toString()}`;

  let type = eventType;
  let data = payload;

  // Handle both signatures:
  // 1. broadcastTenantEvent(orgId, 'event.type', payload)
  // 2. broadcastTenantEvent(orgId, { type: 'event.type', ...data })
  if (typeof eventType === 'object' && eventType !== null) {
    type = eventType.type || 'event';
    const { type: _, ...rest } = eventType;
    data = { ...rest, ...payload };
  }

  sseEmitter.emit(channel, {
    type,
    payload: data,
    ...data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Subscribes an SSE connection to a tenant's event channel
 *
 * @param {string} organizationId - Target organization ID
 * @param {Function} listener - Callback function receiving event objects
 * @returns {Function} - Unsubscribe function
 */
export const subscribeTenantEvents = (organizationId, listener) => {
  if (!organizationId) return () => {};
  const channel = `tenant:${organizationId.toString()}`;
  sseEmitter.on(channel, listener);
  return () => {
    sseEmitter.off(channel, listener);
  };
};
