import mongoose from 'mongoose';

const membershipSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'guest'],
      default: 'member',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

membershipSchema.index({ organization: 1, user: 1 }, { unique: true });

membershipSchema.methods.toJSON = function () {
  const m = this.toObject();
  delete m.__v;
  return m;
};

const Membership = mongoose.model('Membership', membershipSchema);

export default Membership;
