import mongoose from 'mongoose';

const usageRecordSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    metric: {
      type: String,
      enum: ['tasks_created', 'exports_generated', 'storage_bytes'],
      required: true,
      index: true
    },
    period: {
      type: String,
      required: true, // format: 'YYYY-MM' in UTC
      index: true
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index ensuring idempotent atomic tracking per tenant/metric/billing month
usageRecordSchema.index({ organization: 1, metric: 1, period: 1 }, { unique: true });

usageRecordSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const UsageRecord = mongoose.model('UsageRecord', usageRecordSchema);

export default UsageRecord;
