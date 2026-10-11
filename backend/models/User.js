import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const PLAYER_STARTING_SCORE = 150;

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    sparse: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String
  },
  role: {
    type: String,
    enum: ['admin', 'player'],
    default: 'player'
  },
  score: {
    type: Number,
    default: PLAYER_STARTING_SCORE
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    default: null
  },
  sessionToken: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'banned'],
    default: 'active'
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: {
    type: String,
    default: ''
  },
  banExpiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Hash password before saving (only for admins)
userSchema.pre('save', async function() {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ eventId: 1, role: 1, score: -1, createdAt: 1 });
userSchema.index({ username: 1, role: 1 }, { unique: true, partialFilterExpression: { role: 'admin' } });
userSchema.index({ eventId: 1, role: 1, username: 1 }, { unique: true, sparse: true });

const User = mongoose.model('User', userSchema);

export default User;
