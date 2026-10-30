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
      enum: ['pending', 'in_progress', 'review', 'completed'],
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
    remindedAt: {
      type: Date,
      default: null
    },
    recurrence: {
      isRecurring: {
        type: Boolean,
        default: false
      },
      frequency: {
        type: String,
        enum: ['none', 'daily', 'weekly', 'monthly'],
        default: 'none'
      },
      interval: {
        type: Number,
        default: 1
      },
      nextRunDate: {
        type: Date,
        default: null
      }
    },
    subtasks: [
      {
        title: {
          type: String,
          required: true,
          trim: true,
          maxlength: 200
        },
        isCompleted: {
          type: Boolean,
          default: false
        },
        completedAt: {
          type: Date,
          default: null
        }
      }
    ],
    attachments: [
      {
        filename: {
          type: String,
          required: true
        },
        originalName: {
          type: String,
          required: true
        },
        mimeType: {
          type: String,
          required: true
        },
        size: {
          type: Number,
          required: true
        },
        url: {
          type: String,
          required: true
        },
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    category: {
      type: String,
      trim: true,
      default: 'General'
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    collaborators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
      index: true
    },
    isPrivate: {
      type: Boolean,
      default: false,
      index: true
    },
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        content: {
          type: String,
          required: true,
          trim: true,
          maxlength: [1000, 'Comment cannot exceed 1000 characters']
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// High-performance compound indexes for multi-tenant queries and data integrity
taskSchema.index({ organization: 1, isDeleted: 1, status: 1 });
taskSchema.index({ organization: 1, isDeleted: 1, dueDateString: 1 });
taskSchema.index({ organization: 1, isDeleted: 1, priority: 1 });
taskSchema.index({ organization: 1, isDeleted: 1, category: 1 });
taskSchema.index({ organization: 1, isDeleted: 1, deletedAt: -1, _id: 1 });
taskSchema.index({ organization: 1, isDeleted: 1, status: 1, createdAt: -1, _id: 1 });
taskSchema.index({ organization: 1, workspace: 1, isDeleted: 1, createdAt: -1, _id: 1 });
taskSchema.index({ organization: 1, isDeleted: 1, user: 1 });
taskSchema.index({ user: 1, isDeleted: 1, createdAt: -1 });

// Full-text search index for keyword queries on task title and description
taskSchema.index({ title: 'text', description: 'text' });

taskSchema.methods.toJSON = function () {
  const task = this.toObject();
  delete task.__v;
  return task;
};

const Task = mongoose.model('Task', taskSchema);

export default Task;
