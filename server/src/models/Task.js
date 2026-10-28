import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Please provide a task title'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters']
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending'
    },
    dueDate: {
      type: Date,
      default: null
    },
    dueDateString: {
      type: String,
      default: null,
      index: true
    },
    category: {
      type: String,
      trim: true,
      default: 'General'
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// High-performance compound indexes for multi-tenant queries
taskSchema.index({ organization: 1, isDeleted: 1, status: 1 });
taskSchema.index({ organization: 1, isDeleted: 1, dueDateString: 1 });
taskSchema.index({ organization: 1, isDeleted: 1, priority: 1 });
taskSchema.index({ organization: 1, isDeleted: 1, user: 1 });
taskSchema.index({ user: 1, isDeleted: 1, createdAt: -1 });

taskSchema.methods.toJSON = function () {
  const task = this.toObject();
  delete task.__v;
  return task;
};

const Task = mongoose.model('Task', taskSchema);

export default Task;
