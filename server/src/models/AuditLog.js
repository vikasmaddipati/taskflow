import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    targetType: {
      type: String,
      default: ''
    },
    targetId: {
      type: String,
      default: ''
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

auditLogSchema.index({ organization: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
