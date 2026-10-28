import mongoose from 'mongoose';

const workspaceMembershipSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true
    },
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
      enum: ['admin', 'member', 'guest'],
      default: 'member'
    }
  },
  {
    timestamps: true
  }
);

workspaceMembershipSchema.index({ workspace: 1, user: 1 }, { unique: true });

workspaceMembershipSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const WorkspaceMembership = mongoose.model('WorkspaceMembership', workspaceMembershipSchema);

export default WorkspaceMembership;
