import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'team', 'enterprise'],
      default: 'free',
      required: true,
      index: true
    },
    provider: {
      type: String,
      enum: ['razorpay', 'stripe', 'none'],
      default: 'none'
    },
    providerCustomerId: {
      type: String,
      default: null,
      index: true
    },
    providerSubscriptionId: {
      type: String,
      default: null,
      sparse: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      enum: [
        'trialing',
        'active',
        'past_due',
        'canceled',
        'incomplete',
        'incomplete_expired',
        'unpaid',
        'paused'
      ],
      default: 'active',
      index: true
    },
    billingInterval: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly'
    },
    currency: {
      type: String,
      default: 'INR'
    },
    currentPeriodStart: {
      type: Date,
      default: Date.now
    },
    currentPeriodEnd: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    },
    canceledAt: {
      type: Date,
      default: null
    },
    trialStart: {
      type: Date,
      default: null
    },
    trialEnd: {
      type: Date,
      default: null
    },
    failureCode: {
      type: String,
      default: null
    },
    failureReason: {
      type: String,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

subscriptionSchema.index({ organization: 1, status: 1 });

subscriptionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
