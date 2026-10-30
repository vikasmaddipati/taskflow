import mongoose from 'mongoose';

const schedulerLockSchema = new mongoose.Schema(
  {
    lockName: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    lockedBy: {
      type: String,
      required: true
    },
    acquiredAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// TTL index to automatically purge expired locks
schedulerLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SchedulerLock = mongoose.model('SchedulerLock', schedulerLockSchema);

export default SchedulerLock;
