import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Please provide a team name'],
      trim: true,
      maxlength: [100, 'Team name cannot exceed 100 characters']
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  {
    timestamps: true
  }
);

teamSchema.index({ organization: 1, name: 1 }, { unique: true });

teamSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

const Team = mongoose.model('Team', teamSchema);

export default Team;
