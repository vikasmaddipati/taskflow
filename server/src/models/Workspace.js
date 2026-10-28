import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Please provide a workspace name'],
      trim: true,
      maxlength: [50, 'Workspace name cannot exceed 50 characters']
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
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

workspaceSchema.index({ organization: 1, name: 1 }, { unique: true });

workspaceSchema.methods.toJSON = function () {
  const ws = this.toObject();
  delete ws.__v;
  return ws;
};

const Workspace = mongoose.model('Workspace', workspaceSchema);

export default Workspace;
