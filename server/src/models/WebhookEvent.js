import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    provider: {
      type: String,
      required: true,
      default: 'razorpay'
    },
    eventType: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['processed', 'failed', 'ignored'],
      default: 'processed'
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    error: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

webhookEventSchema.index({ provider: 1, createdAt: -1 });

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);

export default WebhookEvent;
