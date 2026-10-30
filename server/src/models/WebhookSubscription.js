import mongoose from 'mongoose';

const webhookSubscriptionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    events: [
      {
        type: String,
        enum: [
          'task.created',
          'task.updated',
          'task.status_changed',
          'task.deleted',
          'member.invited',
          'member.joined',
          'member.removed'
        ]
      }
    ],
    secret: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

webhookSubscriptionSchema.index({ organization: 1, isActive: 1 });

const WebhookSubscription = mongoose.model('WebhookSubscription', webhookSubscriptionSchema);

export default WebhookSubscription;
