import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a category name'],
      trim: true,
      maxlength: [50, 'Category name cannot exceed 50 characters']
    },
    normalizedName: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    color: {
      type: String,
      default: '#6366f1',
      trim: true,
      match: [/^#([0-9a-fA-F]{3}){1,2}$/, 'Please provide a valid hex color code']
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [200, 'Description cannot exceed 200 characters']
    },
    position: {
      type: Number,
      default: 0
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Unique compound index: category names must be unique within an organization & workspace
categorySchema.index(
  { organization: 1, workspace: 1, normalizedName: 1 },
  { unique: true }
);

categorySchema.index({ organization: 1, isArchived: 1, position: 1 });

categorySchema.methods.toJSON = function () {
  const cat = this.toObject();
  delete cat.__v;
  return cat;
};

const Category = mongoose.model('Category', categorySchema);

export default Category;
