import mongoose from 'mongoose';

const invitationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    role: {
      type: String,
      enum: ['admin', 'member', 'guest'],
      default: 'member',
      required: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

invitationSchema.index({ organization: 1, email: 1, status: 1 });

const Invitation = mongoose.model('Invitation', invitationSchema);

export default Invitation;
