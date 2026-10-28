import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    otpHash: {
      type: String,
      required: true
    },
    purpose: {
      type: String,
      enum: ['login', 'reset_password', 'email_verification'],
      required: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    expiresAt: {
      type: Date,
      required: true
    },
    lastSentAt: {
      type: Date,
      default: Date.now
    },
    isUsed: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// TTL index: MongoDB automatically drops expired OTP documents
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for querying active OTPs
otpSchema.index({ email: 1, purpose: 1, isUsed: 1 });

const Otp = mongoose.model('Otp', otpSchema);

export default Otp;
