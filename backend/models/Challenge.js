import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

const attachmentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['file', 'url'],
    default: 'url'
  },
  name: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^(https?:\/\/|\/)/i.test(v);
      },
      message: 'Attachment URL must begin with http://, https://, or /'
    }
  }
}, { _id: false });

const hintSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  cost: {
    type: Number,
    default: 0
  }
}, { _id: false });

const challengeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
    // NOTE: Changed from enum to string to support dynamic categories
    // Frontend/API validates against available categories per event
  },
  difficulty: {
    type: String,
    required: true,
    enum: ['Easy', 'Medium', 'Hard']
  },
  points: {
    type: Number,
    required: true,
    min: 0
  },
  flag: {
    type: String,
    select: false // Never include in queries by default
  },
  flagHash: {
    type: String,
    select: false // CRITICAL: Never expose hashed flag in API responses
    // Note: Required validation is done in pre-save middleware
  },
  flagFormat: {
    type: String,
    default: 'FLAG{...}'
  },
  attachments: [attachmentSchema],
  hints: [hintSchema],
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  solveCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

challengeSchema.index({ eventId: 1, isActive: 1, category: 1, points: 1 });
challengeSchema.index({ eventId: 1, isActive: 1, solveCount: -1 });

// Pre-save middleware: Hash the flag before storing
challengeSchema.pre('save', async function(next) {
  try {
    // If flag field is provided (admin creating/updating challenge)
    if (this.flag) {
      // Trim and hash the flag
      const trimmedFlag = this.flag.trim();
      const hash = await bcryptjs.hash(trimmedFlag, 10);
      this.flagHash = hash;
      // Remove plaintext flag from document to prevent storage
      this.flag = undefined;
    }
    // For new documents, ensure flagHash is set
    if (this.isNew && !this.flagHash) {
      return next(new Error('Flag is required when creating a new challenge'));
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method: Verify a flag against the hash
challengeSchema.methods.verifyFlag = async function(submittedFlag) {
  try {
    const trimmed = submittedFlag.trim();
    return await bcryptjs.compare(trimmed, this.flagHash);
  } catch (error) {
    console.error('Flag verification error:', error.message);
    return false;
  }
};

const Challenge = mongoose.model('Challenge', challengeSchema);

export default Challenge;
