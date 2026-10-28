import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide an organization name'],
      trim: true,
      maxlength: [60, 'Organization name cannot exceed 60 characters']
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    isPersonal: {
      type: Boolean,
      default: false,
      index: true
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'business'],
      default: 'free'
    },
    subscription: {
      stripeCustomerId: { type: String, default: null },
      stripeSubscriptionId: { type: String, default: null },
      stripePriceId: { type: String, default: null },
      status: {
        type: String,
        enum: ['none', 'trialing', 'active', 'past_due', 'canceled', 'incomplete'],
        default: 'none'
      },
      currentPeriodStart: { type: Date, default: null },
      currentPeriodEnd: { type: Date, default: null },
      cancelAtPeriodEnd: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true
  }
);

organizationSchema.methods.toJSON = function () {
  const org = this.toObject();
  delete org.__v;
  return org;
};

const Organization = mongoose.model('Organization', organizationSchema);

export default Organization;
