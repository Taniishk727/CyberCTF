import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  challengeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challenge',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  submittedFlag: {
    type: String,
    // SECURITY: Only stores flag if INCORRECT (for admin review of incorrect attempts)
    // Correct submissions do NOT store the flag (null value)
  }
}, {
  timestamps: true
});

// Compound index to quickly check if user has solved a challenge
submissionSchema.index({ userId: 1, challengeId: 1, isCorrect: 1 });
submissionSchema.index(
  { userId: 1, challengeId: 1 },
  { unique: true, partialFilterExpression: { isCorrect: true } }
);
submissionSchema.index({ eventId: 1, userId: 1, isCorrect: 1 });
submissionSchema.index({ eventId: 1, challengeId: 1, isCorrect: 1 });

const Submission = mongoose.model('Submission', submissionSchema);

export default Submission;
