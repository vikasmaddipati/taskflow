import crypto from 'crypto';
import WebhookSubscription from '../models/WebhookSubscription.js';

/**
 * Dispatches an outgoing webhook event to all active subscribers for an organization
 *
 * @param {string} organizationId - Target tenant ID
 * @param {string} event - Event name (e.g. 'task.created', 'task.status_changed')
 * @param {object} payload - Event payload data
 */
export const dispatchWebhookEvent = async (organizationId, event, payload) => {
  try {
    const subscriptions = await WebhookSubscription.find({
      organization: organizationId,
      isActive: true,
      events: event
    }).lean();

    if (!subscriptions || subscriptions.length === 0) {
      return;
    }

    const eventPayload = {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      event,
      timestamp: new Date().toISOString(),
      organizationId: organizationId.toString(),
      data: payload
    };

    const serializedPayload = JSON.stringify(eventPayload);

    // Asynchronously dispatch to subscribers without blocking HTTP threads
    for (const sub of subscriptions) {
      const signature = crypto
        .createHmac('sha256', sub.secret)
        .update(serializedPayload)
        .digest('hex');

      fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TaskFlow-Event': event,
          'X-TaskFlow-Signature': signature,
          'User-Agent': 'TaskFlow-Webhooks/1.0'
        },
        body: serializedPayload,
        signal: AbortSignal.timeout(5000)
      }).catch((err) => {
        // Silently catch webhook dispatch errors in background
        console.warn(`[Webhook Dispatch Warning] Failed to deliver event ${event} to ${sub.url}:`, err.message);
      });
    }
  } catch (err) {
    console.warn('[Webhook Dispatch Error]', err.message);
  }
};
